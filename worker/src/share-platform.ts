export function isIOSUserAgent(userAgent: string, platform: string, maxTouchPoints: number) {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

export function shouldUsePlaybackConvert(userAgent: string, platform: string, maxTouchPoints: number) {
  return isIOSUserAgent(userAgent, platform, maxTouchPoints) || /Android/i.test(userAgent);
}
