import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { autoSaveFromPush } from './autoSave';
import { extractPushDataFromTaskPayload, readJobDonePayload } from '../notify/pushPayload';

export const BACKGROUND_NOTIFICATION_TASK = 'CLIPPY_BACKGROUND_NOTIFICATION';

/** Alias matching Expo docs naming (package exports TaskResult). */
const BackgroundNotificationResult = Notifications.BackgroundNotificationTaskResult;

TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[clippy] background notification task error', error);
    return BackgroundNotificationResult.Failed;
  }

  try {
    const pushData = extractPushDataFromTaskPayload(data);
    const job = readJobDonePayload(pushData);
    if (!job?.clipId) {
      return BackgroundNotificationResult.NoData;
    }

    await autoSaveFromPush({
      clipId: job.clipId,
      clipUrl: job.clipUrl,
    });
    return BackgroundNotificationResult.NewData;
  } catch (e) {
    console.warn('[clippy] background auto-save failed', e);
    return BackgroundNotificationResult.Failed;
  }
});

export async function registerBackgroundNotificationTask(): Promise<boolean> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
    if (!isRegistered) {
      await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
    }
    return true;
  } catch (e) {
    console.warn('[clippy] registerBackgroundNotificationTask failed', e);
    return false;
  }
}
