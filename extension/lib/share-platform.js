/** @param {string} userAgent @param {string} platform @param {number} maxTouchPoints */
function isIOSUserAgent(userAgent, platform, maxTouchPoints) {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1)
  );
}

/** @param {string} userAgent @param {string} platform @param {number} maxTouchPoints */
function shouldUsePlaybackConvert(userAgent, platform, maxTouchPoints) {
  return isIOSUserAgent(userAgent, platform, maxTouchPoints) || /Android/i.test(userAgent);
}

globalThis.isIOSUserAgent = isIOSUserAgent;
globalThis.shouldUsePlaybackConvert = shouldUsePlaybackConvert;
