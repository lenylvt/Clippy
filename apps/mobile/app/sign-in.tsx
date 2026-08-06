import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestOtp, verifyOtp } from '../src/api/auth';
import { useAuth } from '../src/features/auth/auth';
import { useTheme } from '../src/features/theme/theme';
import { PrimaryButton } from '../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../src/components/ui/SecondaryButton';

async function openMailApp() {
  const candidates =
    Platform.OS === 'ios'
      ? ['message://', 'googlegmail://', 'mailto:']
      : ['googlegmail://', 'mailto:'];
  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      /* try next */
    }
  }
}

export default function SignInScreen() {
  const { setSession } = useAuth();
  const { c, dark } = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await verifyOtp(email.trim(), code.trim());
      await setSession(res.token, res.user.email);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Code incorrect');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.inner}>
          <View style={styles.hero}>
            <Text style={[styles.brand, { color: c.ink }]}>Clippy</Text>
            <Text style={[styles.tagline, { color: c.muted }]}>
              {sent
                ? 'Entre le code reçu par e-mail.'
                : 'Connecte-toi pour retrouver tes clips.'}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}>
            <Text style={[styles.fieldLabel, { color: c.muted }]}>E-mail</Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.surface, color: c.ink, borderColor: c.line }]}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              placeholder="toi@exemple.com"
              placeholderTextColor={c.muted}
              editable={!busy}
            />

            {sent ? (
              <>
                <Text style={[styles.fieldLabel, { color: c.muted, marginTop: 14 }]}>
                  Code à 6 chiffres
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.code,
                    { backgroundColor: c.surface, color: c.ink, borderColor: c.line },
                  ]}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  placeholderTextColor={c.muted}
                  editable={!busy}
                />
              </>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton
                label={sent ? 'Se connecter' : 'Recevoir un code'}
                busy={busy}
                disabled={!sent ? email.trim().length < 5 : code.trim().length !== 6}
                onPress={() => void (sent ? verify() : sendCode())}
              />

              {sent ? (
                <SecondaryButton
                  label="Ouvrir Mail"
                  compact
                  onPress={() => void openMailApp()}
                />
              ) : null}
            </View>
          </View>

          {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    justifyContent: 'center',
    paddingBottom: 32,
  },
  hero: { marginBottom: 28 },
  brand: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: { fontSize: 16, lineHeight: 22, maxWidth: 280 },
  card: {
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  input: {
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  code: {
    letterSpacing: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  actions: { marginTop: 16, gap: 8 },
  error: { marginTop: 16, fontSize: 14, textAlign: 'center' },
});
