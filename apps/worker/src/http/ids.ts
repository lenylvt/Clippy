export function createId() {
  return crypto.randomUUID();
}

export function sanitizeR2KeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}
