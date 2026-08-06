import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { claimPairing } from '../src/api/pairing';
import { useAuth } from '../src/features/auth/auth';
import { extractPairingCode } from '@clippy/shared/pairing';
import { useTheme } from '../src/features/theme/theme';
import { BackButton } from '../src/components/ui/BackButton';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { apiMessageFr } from '../src/lib/apiMessages';

const MIN_CODE_LEN = 6;

export default function ScanScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { c, dark } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const lockRef = useRef(false);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (backTimerRef.current) clearTimeout(backTimerRef.current);
    };
  }, []);

  const claim = async (raw: string) => {
    if (!token || lockRef.current || done) return;
    const code = extractPairingCode(raw);
    if (!code || code.length < MIN_CODE_LEN) {
      setError('Code invalide (6 caractères minimum)');
      return;
    }
    lockRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await claimPairing(token, code);
      if (!mountedRef.current) return;
      setDone(true);
      backTimerRef.current = setTimeout(() => {
        if (mountedRef.current) router.back();
      }, 600);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(apiMessageFr(e, 'Échec de la liaison'));
      lockRef.current = false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const denied = permission && !permission.granted && !permission.canAskAgain;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <BackButton onPress={() => router.back()} label="Fermer" />
      <Text style={[styles.title, { color: c.ink }]} accessibilityRole="header">
        Lier Chrome
      </Text>
      <Text style={[styles.hint, { color: c.muted }]}>
        Ouvre les options de l’extension Clippy, puis scanne le QR ou tape le code.
      </Text>

      {done ? (
        <View style={[styles.success, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}>
          <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>Extension liée</Text>
        </View>
      ) : !permission?.granted ? (
        <View style={{ gap: 10 }}>
          {denied ? (
            <>
              <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>
                La caméra est refusée. Autorise-la dans Réglages, ou entre le code manuellement.
              </Text>
              <SecondaryButton
                label="Ouvrir Réglages"
                onPress={() => void Linking.openSettings()}
              />
            </>
          ) : (
            <PrimaryButton label="Autoriser la caméra" onPress={() => void requestPermission()} />
          )}
        </View>
      ) : (
        <View style={[styles.cameraWrap, { borderColor: c.line, backgroundColor: c.surface }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              done || busy || lockRef.current
                ? undefined
                : ({ data }) => void claim(data)
            }
          />
        </View>
      )}

      {!done ? (
        <>
          <Text style={[styles.or, { color: c.muted }]}>ou entre le code</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: c.surfaceRaised, color: c.ink, borderColor: c.line },
            ]}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            value={manual}
            onChangeText={setManual}
            placeholder="ABCDEF"
            placeholderTextColor={c.muted}
            editable={!busy && !done}
            accessibilityLabel="Code de liaison"
          />
          <PrimaryButton
            label="Lier"
            busy={busy}
            disabled={done || manual.trim().length < MIN_CODE_LEN}
            onPress={() => void claim(manual)}
          />
        </>
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: c.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 4 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 },
  hint: { fontSize: 15, lineHeight: 21, marginBottom: 18, maxWidth: 340 },
  cameraWrap: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  success: {
    height: 120,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  or: { textAlign: 'center', fontSize: 13, marginBottom: 10, fontWeight: '500' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 14,
    fontSize: 20,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  error: { marginTop: 12, textAlign: 'center', fontSize: 14 },
});
