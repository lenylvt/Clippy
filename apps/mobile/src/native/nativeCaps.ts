import { requireOptionalNativeModule } from 'expo';

export function hasNativeVideo() {
  return Boolean(requireOptionalNativeModule('ExpoVideo'));
}
