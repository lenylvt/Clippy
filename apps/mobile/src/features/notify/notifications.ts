import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { autoSaveFromPush } from '../save/autoSave';
import { registerBackgroundNotificationTask } from '../save/backgroundSave';
import { registerPushToken } from '../../api/push';
import { normalizePushData, readJobDonePayload } from './pushPayload';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return Constants.easConfig?.projectId ?? extra?.eas?.projectId;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Clippy',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function ensurePushRegistration(authToken: string): Promise<string | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  try {
    await ensureAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    await registerBackgroundNotificationTask();

    const projectId = easProjectId();
    const tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    await registerPushToken(authToken, tokenData.data);
    return tokenData.data;
  } catch (e) {
    console.warn('[clippy] ensurePushRegistration failed', e);
    return null;
  }
}

export type NotificationListenerOptions = {
  authToken?: string | null;
  onOpenClip?: (clipId: string) => void;
};

function handlePushData(
  data: unknown,
  opts: NotificationListenerOptions,
  { open }: { open?: boolean } = {},
): void {
  const normalized = normalizePushData(data);
  const job = readJobDonePayload(normalized);
  if (!job) return;

  void autoSaveFromPush({
    clipId: job.clipId,
    clipUrl: job.clipUrl,
    token: opts.authToken,
  });

  if (open && job.clipId && opts.onOpenClip) {
    opts.onOpenClip(job.clipId);
  }
}

export function attachNotificationListeners(opts: NotificationListenerOptions = {}) {
  // Cold start: tap while app was killed may fire before listeners attach.
  try {
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      handlePushData(last.notification.request.content.data, opts, { open: true });
      Notifications.clearLastNotificationResponse();
    }
  } catch (e) {
    console.warn('[clippy] getLastNotificationResponse failed', e);
  }

  const sub = Notifications.addNotificationReceivedListener((notification) => {
    handlePushData(notification.request.content.data, opts);
  });

  const resSub = Notifications.addNotificationResponseReceivedListener((response) => {
    handlePushData(response.notification.request.content.data, opts, { open: true });
  });

  return () => {
    sub.remove();
    resSub.remove();
  };
}
