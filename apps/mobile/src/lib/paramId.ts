/** Normalize expo-router dynamic param (`string | string[] | undefined`) to a single id. */
export function paramId(value: string | string[] | undefined): string | null {
  if (value == null) return null;
  const id = Array.isArray(value) ? value[0] : value;
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length ? trimmed : null;
}
