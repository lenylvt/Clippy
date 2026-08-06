import { useEffect, useRef, useState } from 'react';
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
import { apiMessageFr } from '../src/lib/apiMessages';
import { isValidEmail } from '../src/lib/email';

const RESEND_COOLDOWN_S = 45;

async function openMailApp() {
  const candidates =
    Platform.OS === 'ios'
      ? ['message://', 'googlegmail://', 'mailto:']
      : ['googlegmail://', 'mailto:'];
  for (const url of candidates) {
    try {
      const can = await Linking.canOpenURL(url).catch(() => false);
      if (!can && url !== 'mailto:') continue;
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
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<TextInput>(null);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setError('Adresse e-mail invalide.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestOtp(trimmed);
      setSent(true);
      startCooldown();
      setTimeout(() => codeRef.current?.focus(), 100);
    } catch (e) {
      setError(apiMessageFr(e, 'Impossible d’envoyer le code'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (overrideCode?: string) => {
    const trimmedEmail = email.trim();
    const trimmedCode = (overrideCode ?? code).trim();
    if (trimmedCode.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await verifyOtp(trimmedEmail, trimmedCode);
      await setSession(res.token, res.user.email, res.user.id);
    } catch (e) {
      setError(apiMessageFr(e, 'Code incorrect'));
    } finally {
      setBusy(false);
    }
  };

  const resetEmail = () => {
    setSent(false);
    setCode('');
    setError(null);
  };

  const emailOk = isValidEmail(email);
  const canResend = sent && cooldown === 0 && !busy;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
        <View style={styles.inner}>
          <View style={styles.hero}>
            <Text style={[styles.brand, { color: c.ink }]} accessibilityRole="header">
              Clippy
            </Text>
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
              returnKeyType={sent ? 'done' : 'send'}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => {
                if (!sent && emailOk) void sendCode();
              }}
              placeholder="toi@exemple.com"
              placeholderTextColor={c.muted}
              editable={!busy && !sent}
              accessibilityLabel="Adresse e-mail"
            />

            {sent ? (
              <>
                <Text style={[styles.fieldLabel, { color: c.muted, marginTop: 14 }]}>
                  Code à 6 chiffres
                </Text>
                <TextInput
                  ref={codeRef}
                  style={[
                    styles.input,
                    styles.code,
                    { backgroundColor: c.surface, color: c.ink, borderColor: c.line },
                  ]}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                  maxLength={6}
                  value={code}
                  onChangeText={(v) => {
                    const next = v.replace(/\D/g, '').slice(0, 6);
                    setCode(next);
                    if (next.length === 6) void verify(next);
                  }}
                  placeholder="000000"
                  placeholderTextColor={c.muted}
                  editable={!busy}
                  accessibilityLabel="Code à 6 chiffres"
                />
              </>
            ) : null}

            <View style={styles.actions}>
              <PrimaryButton
                label={sent ? 'Se connecter' : 'Recevoir un code'}
                busy={busy}
                disabled={!sent ? !emailOk : code.trim().length !== 6}
                onPress={() => void (sent ? verify() : sendCode())}
              />

              {sent ? (
                <>
                  <SecondaryButton
                    label={
                      cooldown > 0
                        ? `Renvoyer le code (${cooldown}s)`
                        : 'Renvoyer le code'
                    }
                    compact
                    disabled={!canResend}
                    onPress={() => void sendCode()}
                  />
                  <SecondaryButton label="Modifier l’e-mail" compact onPress={resetEmail} />
                  <SecondaryButton
                    label="Ouvrir Mail"
                    compact
                    onPress={() => void openMailApp()}
                  />
                </>
              ) : null}
            </View>
          </View>

          {error ? (
            <Text
              style={[styles.error, { color: c.danger }]}
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          ) : null}
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
    borderRadius: 16,
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
