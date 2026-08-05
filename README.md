# Clippy

Extension Chrome + backend Cloudflare : clip YouTube **côté serveur** (téléchargement ≤1080p, découpe ffmpeg, stockage R2).

URL prod : https://clippy.runtimelayer.workers.dev

---

## Stack Cloudflare — ce qu’on utilise vraiment

| Produit | Oui ? | Rôle |
|---------|-------|------|
| **Workers** | Oui | API HTTP, auth, orchestration, galerie HTML temporaire |
| **Containers** | Oui | yt-dlp + ffmpeg (DL + crop) |
| **Durable Objects** | Oui | `JobQueue` (file) + `ClipContainer` (1 DO par slot container) |
| **R2** | Oui | Fichiers MP4 des clips |
| **D1** | Oui | Métadonnées `clips` + `jobs` (pas « que » Worker/Containers/DO/R2) |
| **Cron Triggers** | Oui | Nettoyage horaire des clips/jobs expirés |
| Queues / KV / Workflows | Non | — |

Donc : **Worker + Containers + Durable Objects + R2 + D1** (+ cron).

---

## Architecture

```
Extension (Chrome)
    │  Bearer deviceToken
    ▼
Worker « clippy »
    │  insert job (D1)
    ▼
Durable Object JobQueue (singleton)
    │  assigne un slot libre (0..3)
    ▼
Durable Object ClipContainer + Container Linux (standard-3)
    │  yt-dlp ≤1080p → ffmpeg crop → bytes MP4
    ▼
Worker met le clip dans R2 + ligne D1 → job = done
Extension poll GET /api/jobs/:id (queued → downloading → cropping → uploading → done)
```

Pas de cache de la vidéo source : chaque job re-télécharge, crop, envoie le clip, puis efface le temporaire disque du container.

---

## Structure du repo

```
apps/extension/     Chrome MV3 (éditeur, file UI, client jobs)
apps/worker/        Worker + Dockerfile + container Python
  src/              API, queue, container class, gallery
  container/        server.py + download.py (yt-dlp / ffmpeg)
  tests/
scripts/bench-job.mjs
```

---

## Les 2 Durable Objects — différence

### 1. `JobQueue` (singleton)
- **1 seule instance** (`idFromName('singleton')`).
- File d’attente : reçoit les jobs, choisit un **slot libre** (max 4), lance le traitement, libère le slot.
- Stocke un peu d’état SQLite DO (`busySlots`, `origin`, alarms pour re-pomper la file).
- **Ne fait pas** le téléchargement vidéo.

### 2. `ClipContainer` (jusqu’à 4 instances)
- Une instance par slot : `slot-0` … `slot-3`.
- C’est la classe `@cloudflare/containers` : le DO **pilote** un vrai container Linux (image Docker).
- Exécute `POST /process` (yt-dlp + ffmpeg) et renvoie le MP4.
- Après chaque job : **`destroy()` explicite** du slot (ne pas compter sur sleep seul).
- `sleepAfter = '10s'` : filet de sécurité si le stop explicite échoue.
- `POST /api/internal/stop-containers` (header `X-Clippy-Internal`) : coupe tous les slots zombie.

En résumé : **JobQueue = chef d’orchestre**, **ClipContainer = ouvrier + VM Linux**.

---

## Quand le container s’éteint ?

1. Pendant un job : reste allumé (activité = requêtes / travail en cours).
2. Fin du job : plus de trafic vers cette instance.
3. Fin de job → **`destroy()`** immédiat du slot ; `sleepAfter = 10s` en secours.
4. Facturation container : **commence** à la 1ʳᵉ requête / start, **s’arrête** quand l’instance dort.

Cold start possible au prochain clip sur un slot endormi (quelques secondes).

---

## TTL R2 / clips

Ce n’est **pas** une lifecycle rule R2 native.

- À la création : `expires_at = now + 48 h` en **D1**.
- Cron **toutes les heures** : lit les lignes expirées → `R2.delete` + delete D1.
- Donc suppression **auto après ~48 h** (au plus tard ~49 h selon le cron).

Pas de cache longue durée de la vidéo YouTube complète.

---

## Pricing (ordre de grandeur, Workers Paid)

Base compte : **~$5 / mois** (Workers Paid), avec quotas inclus sur Workers / DO / Containers / R2.

Tarifs indicatifs (docs Cloudflare, 2026) — toujours vérifier le dashboard.

### Containers (`standard-3` = 2 vCPU, 8 GiB RAM, 16 GB disque)

Facturé seulement **tant que l’instance tourne** (durée du job ; idle max ~10 s si le stop explicite rate).

| Ressource | Inclus / mois (Paid) | Au-delà |
|-----------|----------------------|---------|
| Mémoire | 25 GiB-hours | $0.0000025 / GiB-seconde |
| CPU | 375 vCPU-minutes | $0.000020 / vCPU-seconde |
| Disque | 200 GB-hours | $0.00000007 / GB-seconde |
| Egress container | 1 TB NA/EU inclus | ~$0.025 / GB (NA/EU) |

**Estimation par clip** (ex. ~20 s de job + ~10 s idle max = ~30 s d’instance) :

| Poste | Approx. |
|-------|---------|
| Mémoire 8 GiB × 80 s | ~$0.0016 |
| Disque 16 GB × 80 s | ~$0.0001 |
| CPU actif ~20–40 vCPU·s | ~$0.0004–0.0008 |
| **Total container / clip** | **~$0.002–0.003** |

100 clips/mois ≈ **$0.20–0.30** de containers (hors egress YouTube volumineux / cold starts plus longs).  
Le gros coût variable possible = **egress** si beaucoup de sorties réseau hors Cloudflare.

### Durable Objects

| | Inclus Paid | Au-delà |
|--|-------------|---------|
| Requêtes | 1 M / mois | $0.15 / million |
| Durée | 400 000 GB-s / mois | $12.50 / million GB-s |
| SQLite reads | 25 Md rows | $0.001 / M |
| SQLite writes | 50 M rows | $1.00 / M |
| Stockage SQL | 5 GB-mois | $0.20 / GB-mois |

Chez Clippy : 1 `JobQueue` + jusqu’à 4 `ClipContainer` DO. Usage léger (enqueue, alarmes, état slots) → en pratique **souvent dans le free tier Paid**, sauf très gros volume.

### R2 (Standard)

| | Gratuit / mois | Au-delà |
|--|----------------|---------|
| Stockage | 10 GB-mois | $0.015 / GB-mois |
| Class A (PUT, etc.) | 1 M | $4.50 / M |
| Class B (GET) | 10 M | $0.36 / M |
| **Egress vers Internet** | **Gratuit** | — |

Clips ~5–50 Mo, TTL 48 h → stockage moyen très bas. 1000 clips × 20 Mo × 2 jours / 30 ≈ fraction de Go → **quasi $0** hors ops.

### Workers + D1

- Workers : 10 M requêtes + 30 M CPU-ms inclus / mois.
- D1 : facturation séparée (reads/writes/storage) ; métadonnées jobs/clips = volume faible.

### Scénario type « 100 clips / mois »

| Poste | Est. |
|-------|------|
| Abonnement Workers Paid | $5 |
| Containers | ~$0.20–0.50 |
| DO + Worker + D1 + R2 | ~$0 (dans les inclus) |
| **Total** | **~$5–6 / mois** |

À volume plus élevé (milliers de clips, vidéos longues, cold starts fréquents), le poste **Containers** monte en premier.

---

## API principale

| Méthode | Route | Auth | Rôle |
|---------|-------|------|------|
| `POST` | `/api/jobs` | Bearer device token | Crée un job (meta clip, pas de fichier) |
| `GET` | `/api/jobs/:id` | Bearer | Statut / progress pour l’extension |
| `PATCH` | `/api/internal/jobs/:id` | `X-Clippy-Internal` | Stages depuis le container |
| `GET` | `/clips/:id` | — | Stream MP4 (R2) |
| `GET` | `/` | — | Galerie HTML (temporaire, avant app iOS) |
| `DELETE` | `/api/clips/:id` | — | Supprime clip |
| `GET` | `/api/clips` | — | Liste JSON |

Stages job : `queued` → `downloading` → `cropping` → `uploading` → `done` | `error`.

Limites clip : 3–300 s, titre ≤ 200, vidéo ≤ 1080p.

---

## Sécurité

- Extension → Worker : `Authorization: Bearer <deviceToken>` (généré 1×, `chrome.storage.local`).
- Container → Worker (callbacks) : secret `CONTAINER_SECRET` (`wrangler secret`).
- Container **non exposé** publiquement : uniquement via le DO Worker.
- CORS : `chrome-extension://*`, `*.workers.dev`, localhost.

---

## Dev / deploy

```bash
npm test
npm run worker:migrate:local
npm run worker:dev          # Docker local requis pour Containers

npm run worker:secret       # CONTAINER_SECRET
npm run worker:migrate      # D1 remote
npm run worker:deploy       # build image + push + Worker
```

Bench prod :

```bash
DEVICE_TOKEN=… npm run bench:job
# options : --url … --start 0 --end 8 --base https://clippy.runtimelayer.workers.dev
```

Extension : charger `apps/extension` non empaqueté dans `chrome://extensions`.

---

## Config runtime importante

| Paramètre | Valeur | Fichier |
|-----------|--------|---------|
| Instance container | `standard-3` (2 vCPU / 8 GiB / 16 GB) | `wrangler.jsonc` |
| Max instances | 4 | `wrangler.jsonc` |
| Sleep container | 10 s (+ stop après job) | `src/container.ts` / `src/queue.ts` |
| TTL clips | 48 h | `src/constants.ts` + cron horaire |
| Qualité max | 1080p | `container/download.py` |

---

## Hors scope actuel

- Pas de cache de la vidéo YouTube complète.
- Galerie web = provisoire (prévu : app iOS, suppression du site).
- Pas de Cloudflare Queues / KV / Workflows.
