import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/features/auth/auth';
import { attachNotificationListeners, ensurePushRegistration } from '../src/features/notify/notifications';
import { useTheme } from '../src/features/theme/theme';
// Define background notification task at app entry (iOS wake).
import '../src/features/save/backgroundSave';

function RootNavigator() {
  const { token, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { c, dark } = useTheme();
  const inAuth = segments[0] === 'sign-in' || segments.includes('sign-in' as never);

  useEffect(() => {
    if (!ready) return;
    if (!token && !inAuth) router.replace('/sign-in');
    else if (token && inAuth) router.replace('/');
  }, [token, ready, inAuth, router]);

  useEffect(() => {
    if (!token) return;
    void ensurePushRegistration(token).catch(() => undefined);
    return attachNotificationListeners({
      authToken: token,
      onOpenClip: (clipId) => {
        router.push(`/clip/${clipId}`);
      },
    });
  }, [token, router]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: c.bg,
          gap: 12,
        }}
      >
        <StatusBar style={dark ? 'light' : 'dark'} />
        <ActivityIndicator color={c.ink} accessibilityLabel="Chargement" />
        <Text style={{ color: c.muted, fontSize: 14 }}>Clippy</Text>
      </View>
    );
  }

  // Do not mount the protected stack without a session (avoids flash / deep-link leaks).
  if (!token) {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="sign-in" />
      </Stack>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="activity" />
      <Stack.Screen name="clip/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
