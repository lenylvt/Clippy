# Clippy

Extension Chrome + app iOS + backend Cloudflare : clip YouTube **côté serveur** (téléchargement ≤1080p, découpe ffmpeg, stockage R2).

URL prod : https://clippy.runtimelayer.workers.dev

---

## Stack Cloudflare

| Produit | Rôle |
|---------|------|
| **Workers** | API HTTP, auth email OTP, pairing, orchestration |
| **Email Sending** | OTP depuis `clippy@lenylvt.cc` |
| **Containers** | yt-dlp + ffmpeg |
| **Durable Objects** | `JobQueue` + `ClipContainer` |
| **R2** | MP4 des clips |
| **D1** | users, sessions, devices, jobs, clips |
| **Cron** | nettoyage TTL ~48 h |

---

## Flux

```
App iOS (Expo) ── OTP email ──► Worker ── Email Sending
     │ scan QR
Extension ── pairing code ──► lie device_token ↔ user
     │ Bearer device (pairé)
     ▼
Worker → JobQueue → ClipContainer → R2
     │
     └─ push Expo (start / progress / done)
```

Pas de galerie HTML : les clips se consultent dans l’app (`GET /api/me/clips`). Stream direct : `GET /clips/:id`.

---

## Structure

```
apps/extension/   Chrome MV3 (éditeur + QR pairing dans Options)
apps/worker/      Worker + Dockerfile + container Python
apps/mobile/      Expo (dev client iPhone, pas de simulateur)
scripts/bench-job.mjs
```

---

## Auth & sécurité

| Acteur | Preuve |
|--------|--------|
| App | Session après OTP 6 chiffres |
| Extension | Device token **relié** à un user (sinon `403 pairing_required`) |
| Container → Worker | `X-Clippy-Internal` / `CONTAINER_SECRET` |
| Pairing | Code 8 chars, TTL 2 min, one-shot |

---

## App iOS (Expo)

**Jamais de simulateur** (Mac trop juste) : build **development client** sur iPhone réel.

```bash
cd apps/mobile
npm run login          # ou: npx eas-cli login
npx eas-cli init       # mets le projectId dans app.json → extra.eas.projectId
npm run ios:device
npm start
```

Puis installe le build sur l’iPhone (lien Expo) et :

```bash
npx expo start --dev-client
```

Profils `eas.json` : `"simulator": false` partout.

### Écrans

- Sign-in : email → **Envoyer le code** → OTP
- Home : liste des clips
- Scan : QR / code manuel (`clippy://pair?code=…`)
- Activité : file jobs en cours

---

## Extension

Options → **Compte téléphone** → Afficher le QR → scanner dans l’app.  
Sans liaison, un clip affiche « Relie l’app ».

---

## Deploy worker

```bash
npm run worker:migrate
npm run worker:deploy   # Docker requis pour image container ; sinon --containers-rollout=none
```

Secrets : `CONTAINER_SECRET`, `OTP_PEPPER` (ou `SESSION_SECRET` pour HMAC OTP + URLs clips signées), `EXPO_ACCESS_TOKEN` (push Expo). Binding email `EMAIL` (from `clippy@lenylvt.cc`).  
Vars : `PUBLIC_ORIGIN` (URLs clips / push), `PUBLIC_ORIGINS` (CORS, origines absolues séparées par des virgules), `EXTENSION_ID` (ID Chrome). Localhost / `127.0.0.1` restent autorisés en CORS en dev.  
Migrations D1 à appliquer : `0008` (auth/devices), `0009` (job attempts/origin), `0010` (indexes).

---

## Containers

- Après chaque job : `destroy()` du slot
- `sleepAfter = 10s` en secours
- Max 4 slots (`standard-3`)

---

## TTL clips

`expires_at` D1 + cron horaire → delete R2 + ligne. ~48 h.
