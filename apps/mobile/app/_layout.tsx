import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/features/auth/auth';
import { attachNotificationListeners, ensurePushRegistration } from '../src/features/notify/notifications';
import { useTheme } from '../src/features/theme/theme';
// Define background notification task at app entry (iOS wake).
import '../src/features/save/backgroundSave';

function RootNavigator() {
  const { token, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { c } = useTheme();

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === 'sign-in';
    if (!token && !inAuth) router.replace('/sign-in');
    else if (token && inAuth) router.replace('/');
  }, [token, ready, segments, router]);

  useEffect(() => {
    if (!token) return;
    void ensurePushRegistration(token);
    return attachNotificationListeners();
  }, [token]);

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
        <ActivityIndicator color={c.ink} />
        <Text style={{ color: c.muted, fontSize: 14 }}>Clippy</Text>
      </View>
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
      <Stack.Screen name="sign-in" />
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
