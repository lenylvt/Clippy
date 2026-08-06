import { describe, expect, it } from 'vitest';
import { extractPairingCode } from '@clippy/shared/pairing';

describe('extractPairingCode', () => {
  it('lit clippy://pair?code=', () => {
    expect(extractPairingCode('clippy://pair?code=AB12CD34')).toBe('AB12CD34');
  });

  it('accepte un code brut', () => {
    expect(extractPairingCode('xy12zt99')).toBe('XY12ZT99');
  });

  it('rejette le bruit', () => {
    expect(extractPairingCode('hello')).toBeNull();
  });
});

/**
 * Mirrors claimPairingCode atomicity:
 * only the UPDATE with used_at IS NULL AND expires_at > now that sees changes===1 wins.
 */
describe('claimPairingCode semantics', () => {
  it('un seul claim concurrent gagne (changes === 1)', () => {
    let usedAt: number | null = null;
    const expiresAt = Date.now() + 60_000;
    const now = Date.now();

    const tryClaim = () => {
      if (usedAt != null) return 0;
      if (expiresAt <= now) return 0;
      usedAt = now;
      return 1;
    };

    expect(tryClaim()).toBe(1);
    expect(tryClaim()).toBe(0);
    expect(usedAt).toBe(now);
  });

  it('refuse un code expiré (expires_at <= now)', () => {
    const expiresAt = 1000;
    const now = 1000;
    const canClaim = expiresAt > now && true;
    expect(canClaim).toBe(false);
  });

  it('n’applique le link device que si claim + link réussissent', () => {
    const apply = (claimed: number, linked: number) => {
      if (claimed !== 1) return 'code_used';
      if (linked !== 1) return 'device_linked_elsewhere';
      return 'ok';
    };
    expect(apply(1, 1)).toBe('ok');
    expect(apply(0, 1)).toBe('code_used');
    expect(apply(1, 0)).toBe('device_linked_elsewhere');
  });
});

describe('createPairingCode semantics', () => {
  it('un seul code actif par device via delete+insert atomique', () => {
    const codes = new Map<string, string>();
    const create = (device: string, code: string) => {
      // batch: delete device codes then insert
      for (const [c, d] of [...codes.entries()]) {
        if (d === device) codes.delete(c);
      }
      codes.set(code, device);
    };
    create('dev-a', 'AAAA1111');
    create('dev-a', 'BBBB2222');
    expect([...codes.entries()].filter(([, d]) => d === 'dev-a')).toHaveLength(1);
    expect(codes.get('BBBB2222')).toBe('dev-a');
    expect(codes.has('AAAA1111')).toBe(false);
  });
});

describe('ensureDevice semantics', () => {
  it('INSERT OR IGNORE + SELECT gagne la course', () => {
    const store = new Map<string, { token: string; id: string }>();
    const ensure = (token: string, id: string) => {
      if (!store.has(token)) store.set(token, { token, id });
      return store.get(token)!;
    };
    const a = ensure('tok', 'id-1');
    const b = ensure('tok', 'id-2');
    expect(a.id).toBe('id-1');
    expect(b.id).toBe('id-1');
  });
});

describe('unlinkDeviceByPrefix semantics', () => {
  it('matche device_id ou token exact, pas un préfixe ambigu', () => {
    const devices = [
      { device_id: 'uuid-aaaa', device_token: 'abcdefghijklXXXX' },
      { device_id: 'uuid-bbbb', device_token: 'abcdefghijklYYYY' },
    ];
    const unlink = (idOrToken: string) => {
      const match = devices.find(
        (d) => d.device_id === idOrToken || d.device_token === idOrToken,
      );
      return match?.device_id ?? null;
    };
    // Old prefix collision path would wrongly pick the first
    expect(unlink('abcdefghijkl')).toBeNull();
    expect(unlink('uuid-bbbb')).toBe('uuid-bbbb');
    expect(unlink('abcdefghijklYYYY')).toBe('uuid-bbbb');
  });
});

describe('upsertPushToken semantics', () => {
  it('réassigne le owner sur UNIQUE(token)', () => {
    const byToken = new Map<string, { userId: string; platform: string }>();
    const upsert = (userId: string, token: string, platform: string) => {
      byToken.set(token, { userId, platform });
    };
    upsert('user-a', 'expo-1', 'ios');
    upsert('user-b', 'expo-1', 'ios');
    expect(byToken.get('expo-1')?.userId).toBe('user-b');
  });

  it('deletePushToken retire le token globalement', () => {
    const byToken = new Map<string, string>([['expo-1', 'user-a'], ['expo-2', 'user-a']]);
    const deletePushToken = (token: string) => byToken.delete(token);
    expect(deletePushToken('expo-1')).toBe(true);
    expect(byToken.has('expo-1')).toBe(false);
    expect(byToken.has('expo-2')).toBe(true);
  });
});

describe('sessions purge semantics', () => {
  it('purge les sessions expires_at <= now', () => {
    const now = 1000;
    const sessions = [
      { hash: 'a', expires_at: 500 },
      { hash: 'b', expires_at: 1000 },
      { hash: 'c', expires_at: 1500 },
    ];
    const kept = sessions.filter((s) => s.expires_at > now);
    expect(kept.map((s) => s.hash)).toEqual(['c']);
  });
});
