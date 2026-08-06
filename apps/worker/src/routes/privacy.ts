/**
 * Public privacy policy page for Chrome Web Store / App Store disclosures.
 * Served at GET /privacy — no auth.
 */

const CONTACT_EMAIL = 'clippy@lenylvt.cc';
const LAST_UPDATED = '6 août 2026';

export const PRIVACY_PATH = '/privacy';

export function buildPrivacyHtml(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>Règles de confidentialité — Clippy</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: oklch(98% 0.01 250);
      --fg: oklch(22% 0.02 260);
      --muted: oklch(45% 0.02 260);
      --rule: oklch(88% 0.01 250);
      --accent: oklch(48% 0.12 250);
    }
    @supports not (color: oklch(0% 0 0)) {
      :root {
        --bg: #f6f7f9;
        --fg: #1a1d24;
        --muted: #5c6370;
        --rule: #d8dce3;
        --accent: #3b5bdb;
      }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: oklch(18% 0.02 260);
        --fg: oklch(94% 0.01 250);
        --muted: oklch(72% 0.02 250);
        --rule: oklch(32% 0.02 260);
        --accent: oklch(78% 0.1 250);
      }
      @supports not (color: oklch(0% 0 0)) {
        :root {
          --bg: #12141a;
          --fg: #eef0f4;
          --muted: #a0a6b3;
          --rule: #2a2f3a;
          --accent: #8aa4ff;
        }
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    main {
      max-width: 42rem;
      margin: 0 auto;
      padding: 2.5rem 1.25rem 4rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 650;
      letter-spacing: -0.02em;
      text-wrap: balance;
      margin: 0 0 0.35rem;
    }
    .meta {
      color: var(--muted);
      font-size: 0.95rem;
      margin: 0 0 1.75rem;
    }
    h2 {
      font-size: 1.1rem;
      font-weight: 650;
      margin: 1.75rem 0 0.55rem;
      letter-spacing: -0.01em;
    }
    p, li { text-wrap: pretty; }
    p { margin: 0 0 0.85rem; }
    ul {
      margin: 0 0 0.85rem;
      padding-left: 1.2rem;
    }
    li { margin: 0.25rem 0; }
    a { color: var(--accent); }
    hr {
      border: 0;
      border-top: 1px solid var(--rule);
      margin: 1.75rem 0;
    }
  </style>
</head>
<body>
  <main>
    <h1>Règles de confidentialité</h1>
    <p class="meta">Clippy · Dernière mise à jour : ${LAST_UPDATED}</p>

    <p>
      Clippy est un service de découpe de passages YouTube composé d’une extension
      Chrome, d’une application iOS et d’une API hébergée sur Cloudflare
      (Workers, D1, R2, Containers). Cette page décrit quelles données nous
      traitons, pourquoi, et comment les exercer.
    </p>

    <h2>Responsable du traitement</h2>
    <p>
      Pour toute question relative à la confidentialité :
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
    </p>

    <h2>Données que nous traitons</h2>
    <ul>
      <li><strong>Compte</strong> : adresse e-mail (connexion par code OTP dans l’app).</li>
      <li><strong>Authentification</strong> : jetons de session (app), jeton d’appareil (extension), codes de liaison temporaires.</li>
      <li><strong>Notifications</strong> : jeton push Expo / appareil, lorsque l’app les enregistre.</li>
      <li><strong>Contenu lié aux clips</strong> : URL YouTube, identifiant vidéo, titre, bornes de début/fin, métadonnées de job (statut, progression, erreurs).</li>
      <li><strong>Fichiers</strong> : fichiers vidéo des clips stockés temporairement sur R2.</li>
      <li><strong>Technique</strong> : adresse IP et journaux de requêtes traités par l’infrastructure Cloudflare (sécurité, rate limiting, diagnostic).</li>
    </ul>
    <p>
      Nous ne collectons pas d’historique de navigation global : seules les
      informations nécessaires à un clip que vous créez sont envoyées à l’API.
    </p>

    <h2>Finalités</h2>
    <ul>
      <li>Authentifier l’utilisateur et lier l’extension à l’app (pairing).</li>
      <li>Traiter, stocker et livrer les clips demandés.</li>
      <li>Informer de l’avancement des jobs (notifications push).</li>
      <li>Sécuriser le service (limites de débit, détection d’abus).</li>
    </ul>

    <h2>Base légale</h2>
    <p>
      Le traitement repose sur l’exécution du service que vous demandez
      (création de compte, liaison d’appareil, génération de clips) et, le cas
      échéant, sur notre intérêt légitime à sécuriser l’infrastructure.
    </p>

    <h2>Conservation</h2>
    <ul>
      <li>Les clips et jobs associés expirent automatiquement après environ <strong>48 heures</strong>, puis sont purgés (base D1 et objets R2).</li>
      <li>Le compte (e-mail) et les jetons liés restent tant que le compte / la liaison existent ; vous pouvez délier un appareil depuis l’extension ou l’app.</li>
      <li>Les codes OTP et de pairing sont à courte durée de vie et à usage limité.</li>
    </ul>

    <h2>Partage et sous-traitants</h2>
    <p>
      Nous ne vendons pas vos données. Elles sont traitées pour faire fonctionner
      Clippy, notamment via Cloudflare (hébergement, stockage, e-mail transactionnel
      OTP) et Expo (envoi de notifications push). Aucun transfert à des fins
      publicitaires ou de solvabilité.
    </p>

    <h2>Extension Chrome</h2>
    <p>
      L’extension stocke localement (via <code>chrome.storage</code>) le jeton
      d’appareil et vos préférences (par ex. durée de clip par défaut). Elle
      n’accède qu’aux pages YouTube nécessaires pour l’éditeur, et communique
      avec l’API Clippy pour le pairing et les jobs.
    </p>

    <h2>Vos droits</h2>
    <p>
      Selon votre résidence, vous pouvez demander l’accès, la rectification ou
      la suppression de vos données (compte, appareils liés, clips encore
      présents). Contactez-nous à
      <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
      Vous pouvez aussi délier l’extension, vous déconnecter de l’app, ou
      désinstaller les clients.
    </p>

    <h2>Enfants</h2>
    <p>
      Clippy n’est pas destiné aux enfants de moins de 13 ans (ou l’âge minimum
      applicable dans votre pays). Nous ne collectons pas sciemment de données
      d’enfants.
    </p>

    <h2>Modifications</h2>
    <p>
      Cette page peut être mise à jour. La date en tête indique la version en
      vigueur. Pour le Chrome Web Store, l’URL de cette page est :
      <code>/privacy</code> sur le domaine de l’API Clippy.
    </p>

    <hr />
    <p class="meta">URL de publication : <code>https://clippy.runtimelayer.workers.dev/privacy</code></p>
  </main>
</body>
</html>`;
}

export function handlePrivacy(): Response {
  return new Response(buildPrivacyHtml(), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
