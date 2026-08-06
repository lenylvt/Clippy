const FR: Record<string, string> = {
  email_send_failed: 'Impossible d’envoyer l’e-mail. Réessaie dans un instant.',
  email_invalid: 'Adresse e-mail invalide.',
  invalid_otp_format: 'Le code doit contenir 6 chiffres.',
  otp_invalid: 'Code incorrect ou expiré.',
  otp_expired: 'Code expiré. Demande-en un nouveau.',
  rate_limited: 'Trop de tentatives. Attends un moment.',
  unauthorized: 'Session expirée. Reconnecte-toi.',
  http_429: 'Trop de tentatives. Attends un moment.',
  http_401: 'Session expirée. Reconnecte-toi.',
  http_403: 'Accès refusé.',
  http_404: 'Introuvable.',
  http_500: 'Erreur serveur. Réessaie plus tard.',
  photos_permission: 'Autorise l’accès à Photos dans Réglages.',
  download_incomplete: 'Téléchargement incomplet. Réessaie.',
  no_cache: 'Stockage local indisponible.',
  pairing_invalid: 'Code de liaison invalide ou expiré.',
  pairing_used: 'Ce code a déjà été utilisé.',
  network_error: 'Pas de connexion. Réessaie.',
  missing_api_url: 'Configuration API manquante.',
};

/** Map API / native error codes to French user-facing copy. */
export function apiMessageFr(raw: unknown, fallback = 'Une erreur est survenue'): string {
  if (raw == null) return fallback;
  if (typeof raw === 'object' && raw !== null && 'code' in raw && typeof (raw as { code: unknown }).code === 'string') {
    const code = (raw as { code: string }).code;
    if (FR[code]) return FR[code]!;
  }
  const key =
    typeof raw === 'string'
      ? raw
      : raw instanceof Error
        ? raw.message
        : String(raw);
  if (FR[key]) return FR[key]!;
  if (/^http_\d+$/.test(key)) return FR[key] ?? 'Erreur réseau. Réessaie.';
  // Already human-readable (spaces / accents) — keep as-is.
  if (/[àâäéèêëïîôùûüç\s]/i.test(key) || key.includes(' ')) return key;
  return fallback;
}
