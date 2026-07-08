/** @param {string} userAgent @param {string} platform @param {number} maxTouchPoints */
export function isIOSUserAgent(userAgent, platform, maxTouchPoints) {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

/** @param {string} userAgent @param {string} platform @param {number} maxTouchPoints */
export function shouldUsePlaybackConvert(userAgent, platform, maxTouchPoints) {
  return isIOSUserAgent(userAgent, platform, maxTouchPoints) || /Android/i.test(userAgent);
}
