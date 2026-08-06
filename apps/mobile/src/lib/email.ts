/** Minimal email shape check for OTP request UX. */
export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  if (email.length < 5 || email.length > 254) return false;
  // Local@domain with at least one dot in domain; no spaces.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
