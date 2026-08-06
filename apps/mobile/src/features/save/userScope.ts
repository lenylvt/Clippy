/** Current signed-in user id for namespaced prefs (set by auth). */
let currentUserId: string | null = null;

export function setStorageUserId(userId: string | null): void {
  currentUserId = userId?.trim() || null;
}

export function getStorageUserId(): string | null {
  return currentUserId;
}

/** Namespaced storage key; falls back to legacy key when signed out. */
export function scopedKey(base: string): string {
  return currentUserId ? `${base}:${currentUserId}` : base;
}
