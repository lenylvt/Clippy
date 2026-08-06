import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchMe, logout as apiLogout } from '../../api/auth';
import { setOnUnauthorized } from '../../api/client';
import { clearSavedClipsForCurrentUser } from '../save/savedClips';
import { clearAutoSaveForCurrentUser } from '../save/settings';
import { setStorageUserId } from '../save/userScope';

const TOKEN_KEY = 'clippy_session_v1';
const LEGACY_TOKEN_KEY = 'clippy_session';
const USER_ID_KEY = 'clippy_user_id_v1';

const secureOpts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

type AuthState = {
  token: string | null;
  email: string | null;
  userId: string | null;
  ready: boolean;
  setSession: (token: string, email: string, userId?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function isUnauthorized(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (status === 401 || status === 403) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg === 'http_401' || msg === 'http_403' || /unauthorized|forbidden/i.test(msg);
}

async function readSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, secureOpts);
  } catch {
    return SecureStore.getItemAsync(key).catch(() => null);
  }
}

async function writeSecure(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, secureOpts);
}

async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, secureOpts);
  } catch {
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
  }
}

/** Migrate WHEN_UNLOCKED → AFTER_FIRST_UNLOCK and legacy key → v1. */
async function migrateSessionToken(): Promise<string | null> {
  for (const key of [TOKEN_KEY, LEGACY_TOKEN_KEY]) {
    let value = await readSecure(key);
    if (value == null) {
      try {
        value = await SecureStore.getItemAsync(key);
      } catch {
        value = null;
      }
    }
    if (!value) continue;
    // Rewrite with AFTER_FIRST_UNLOCK (delete+set required for accessibility change).
    await deleteSecure(key);
    if (key === LEGACY_TOKEN_KEY) {
      await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY).catch(() => undefined);
    }
    await writeSecure(TOKEN_KEY, value);
    return value;
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  const signingOutRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await migrateSessionToken();
        if (!stored) return;
        if (cancelled) return;

        const storedUserId = await readSecure(USER_ID_KEY);
        if (storedUserId) setStorageUserId(storedUserId);

        try {
          const me = await fetchMe(stored);
          if (cancelled) return;
          setToken(stored);
          setEmail(me.user.email);
          setUserId(me.user.id);
          setStorageUserId(me.user.id);
          await writeSecure(USER_ID_KEY, me.user.id);
        } catch (e) {
          if (cancelled) return;
          if (isUnauthorized(e)) {
            await deleteSecure(TOKEN_KEY);
            await deleteSecure(USER_ID_KEY);
            setStorageUserId(null);
          } else {
            // Keep token on network / transient errors.
            setToken(stored);
            if (storedUserId) setUserId(storedUserId);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback(async (nextToken: string, nextEmail: string, nextUserId?: string) => {
    const trimmed = nextToken.trim();
    if (!trimmed) throw new Error('Jeton de session manquant');
    await writeSecure(TOKEN_KEY, trimmed);
    if (nextUserId) {
      await writeSecure(USER_ID_KEY, nextUserId);
      setStorageUserId(nextUserId);
      setUserId(nextUserId);
    }
    setToken(trimmed);
    setEmail(nextEmail);
  }, []);

  const signOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      const current = tokenRef.current;
      if (current) {
        try {
          await apiLogout(current);
        } catch {
          /* best-effort */
        }
      }
      try {
        await clearSavedClipsForCurrentUser();
        await clearAutoSaveForCurrentUser();
      } catch {
        /* ignore */
      }
      await deleteSecure(TOKEN_KEY);
      await deleteSecure(USER_ID_KEY);
      await SecureStore.deleteItemAsync(LEGACY_TOKEN_KEY).catch(() => undefined);
      setStorageUserId(null);
      setToken(null);
      setEmail(null);
      setUserId(null);
    } finally {
      signingOutRef.current = false;
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      void signOut();
    });
    return () => setOnUnauthorized(null);
  }, [signOut]);

  const value = useMemo(
    () => ({ token, email, userId, ready, setSession, signOut }),
    [token, email, userId, ready, setSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors du AuthProvider');
  return ctx;
}
