import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { autoSaveFromPush } from './autoSave';

export const BACKGROUND_NOTIFICATION_TASK = 'CLIPPY_BACKGROUND_NOTIFICATION';

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) return;
  const payload = data as {
    notification?: { request?: { content?: { data?: Record<string, unknown> } } };
  };
  const notifData = payload?.notification?.request?.content?.data;
  if (!notifData || notifData.type !== 'job_done') return;
  await autoSaveFromPush({
    clipId: typeof notifData.clipId === 'string' ? notifData.clipId : undefined,
    clipUrl: typeof notifData.clipUrl === 'string' ? notifData.clipUrl : undefined,
  });
});

export async function registerBackgroundNotificationTask() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    if (!isRegistered) {
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }
  } catch {
    /* simulator / unsupported */
  }
}
