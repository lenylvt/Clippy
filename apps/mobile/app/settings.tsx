import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMyDevices, unlinkDevice } from '../src/api/pairing';
import type { PairedDevice } from '../src/api/types';
import { useAuth } from '../src/features/auth/auth';
import { getAutoSave, setAutoSave } from '../src/features/save/settings';
import { useTheme } from '../src/features/theme/theme';
import { BackButton } from '../src/components/ui/BackButton';
import { LoadingBlock } from '../src/components/ui/LoadingBlock';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';

export default function SettingsScreen() {
  const { email, token, signOut } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const [autoSave, setAuto] = useState(false);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const loadDevices = useCallback(async () => {
    if (!token) return;
    setLoadingDevices(true);
    try {
      const res = await fetchMyDevices(token);
      setDevices(res.devices);
    } finally {
      setLoadingDevices(false);
    }
  }, [token]);

  useEffect(() => {
    void getAutoSave().then(setAuto);
    void loadDevices().catch(() => setLoadingDevices(false));
  }, [loadDevices]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <BackButton onPress={() => router.back()} />
      <Text style={[styles.title, { color: c.ink }]}>Réglages</Text>
      {email ? <Text style={[styles.email, { color: c.muted }]}>{email}</Text> : null}

      <Text style={[styles.section, { color: c.muted }]}>Photos</Text>
      <View style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.rowLabel, { color: c.ink }]}>Enregistrement auto</Text>
            <Text style={[styles.rowHint, { color: c.muted }]}>
              Sauve chaque nouveau clip dans Photos sans ouvrir l’app.
            </Text>
          </View>
          <Switch
            value={autoSave}
            onValueChange={(v) => {
              setAuto(v);
              void setAutoSave(v);
            }}
          />
        </View>
      </View>

      <Text style={[styles.section, { color: c.muted }]}>Extension Chrome</Text>
      <View style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}>
        {loadingDevices ? (
          <LoadingBlock label="Chargement…" />
        ) : devices.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={[styles.rowLabel, { color: c.ink }]}>Pas encore liée</Text>
            <Text style={[styles.rowHint, { color: c.muted, marginBottom: 14 }]}>
              Scanne le QR depuis les options de l’extension Clippy.
            </Text>
            <PrimaryButton label="Lier Chrome" onPress={() => router.push('/scan')} />
          </View>
        ) : (
          <>
            {devices.map((d, i) => (
              <View
                key={d.id}
                style={[
                  styles.device,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: c.ink }]}>{d.label || 'Chrome'}</Text>
                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>Connecté</Text>
                </View>
                <Pressable
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.pressed]}
                  onPress={() => {
                    if (!token) return;
                    void unlinkDevice(token, d.id).then(loadDevices);
                  }}
                >
                  <Text style={{ color: c.danger, fontWeight: '600' }}>Délier</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ padding: 14, paddingTop: 4 }}>
              <SecondaryButton label="Lier une autre extension" onPress={() => router.push('/scan')} />
            </View>
          </>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.out, pressed && styles.pressed]}
        onPress={() => void signOut()}
      >
        <Text style={{ color: c.danger, fontSize: 16, fontWeight: '600' }}>Se déconnecter</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, marginBottom: 4 },
  email: { marginBottom: 24, fontSize: 14 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 22,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  emptyBlock: { padding: 14 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowHint: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  out: { paddingVertical: 14, alignItems: 'center' },
  pressed: { opacity: 0.7 },
});
