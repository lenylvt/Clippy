import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { autoSaveFromPush } from '../save/autoSave';
import { registerBackgroundNotificationTask } from '../save/backgroundSave';
import { registerPushToken } from '../../api/push';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensurePushRegistration(authToken: string) {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  await registerBackgroundNotificationTask();

  const tokenData = await Notifications.getExpoPushTokenAsync();
  await registerPushToken(authToken, tokenData.data);
  return tokenData.data;
}

function readPushData(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (data.type === 'job_done') {
    void autoSaveFromPush({
      clipId: typeof data.clipId === 'string' ? data.clipId : undefined,
      clipUrl: typeof data.clipUrl === 'string' ? data.clipUrl : undefined,
    });
  }
}

export function attachNotificationListeners() {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    readPushData(notification.request.content.data as Record<string, unknown>);
  });

  const resSub = Notifications.addNotificationResponseReceivedListener((response) => {
    readPushData(response.notification.request.content.data as Record<string, unknown>);
  });

  return () => {
    sub.remove();
    resSub.remove();
  };
}
