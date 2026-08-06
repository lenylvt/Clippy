import { requireOptionalNativeModule } from 'expo';

let cached: boolean | null = null;

/** Whether the ExpoVideo native module is linked (dev client / production). */
export function hasNativeVideo(): boolean {
  if (cached == null) {
    cached = Boolean(requireOptionalNativeModule('ExpoVideo'));
  }
  return cached;
}
