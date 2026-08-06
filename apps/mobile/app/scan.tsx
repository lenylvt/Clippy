import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { claimPairing } from '../src/api/pairing';
import { useAuth } from '../src/features/auth/auth';
import { extractPairingCode } from '@clippy/shared/pairing';
import { useTheme } from '../src/features/theme/theme';
import { BackButton } from '../src/components/ui/BackButton';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';

export default function ScanScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const claim = async (raw: string) => {
    if (!token || busy || done) return;
    const code = extractPairingCode(raw);
    if (!code) {
      setError('Code invalide');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await claimPairing(token, code);
      setDone(true);
      setTimeout(() => router.back(), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la liaison');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <BackButton onPress={() => router.back()} label="Fermer" />
      <Text style={[styles.title, { color: c.ink }]}>Lier Chrome</Text>
      <Text style={[styles.hint, { color: c.muted }]}>
        Ouvre les options de l’extension Clippy, puis scanne le QR ou tape le code.
      </Text>

      {!permission?.granted ? (
        <PrimaryButton label="Autoriser la caméra" onPress={() => void requestPermission()} />
      ) : (
        <View style={[styles.cameraWrap, { borderColor: c.line, backgroundColor: c.surface }]}>
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={done || busy ? undefined : ({ data }) => void claim(data)}
          />
        </View>
      )}

      <Text style={[styles.or, { color: c.muted }]}>ou entre le code</Text>
      <TextInput
        style={[styles.input, { backgroundColor: c.surfaceRaised, color: c.ink, borderColor: c.line }]}
        autoCapitalize="characters"
        value={manual}
        onChangeText={setManual}
        placeholder="ABCDEF"
        placeholderTextColor={c.muted}
        editable={!busy && !done}
      />
      <PrimaryButton
        label={done ? 'Lié ✓' : 'Lier'}
        busy={busy}
        disabled={done || manual.trim().length < 4}
        onPress={() => void claim(manual)}
      />
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
      <View style={{ marginTop: 12 }}>
        <SecondaryButton label="Plus tard" onPress={() => router.back()} />
      </View>
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
