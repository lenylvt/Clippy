import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, logout as apiLogout } from '../../api/auth';

const TOKEN_KEY = 'clippy_session';

type AuthState = {
  token: string | null;
  email: string | null;
  ready: boolean;
  setSession: (token: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored) {
          const me = await fetchMe(stored);
          setToken(stored);
          setEmail(me.user.email);
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setSession = useCallback(async (nextToken: string, nextEmail: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setEmail(nextEmail);
  }, []);

  const signOut = useCallback(async () => {
    if (token) {
      try {
        await apiLogout(token);
      } catch {
        /* ignore */
      }
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setEmail(null);
  }, [token]);

  const value = useMemo(
    () => ({ token, email, ready, setSession, signOut }),
    [token, email, ready, setSession, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
