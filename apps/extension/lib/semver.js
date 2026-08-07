/** @file Semver compare for sideloaded extension updates. */

/**
 * @param {string} version
 * @returns {number[]}
 */
function parseSemverParts(version) {
  if (typeof version !== 'string') return [0, 0, 0];
  const core = version.trim().split(/[+-]/)[0] || '0';
  const parts = core.split('.').map((p) => {
    const n = Number.parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a < b, 0 if equal, positive if a > b
 */
function compareSemver(a, b) {
  const left = parseSemverParts(a);
  const right = parseSemverParts(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = left[i] - right[i];
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * @param {string} local
 * @param {string} remote
 */
function isRemoteNewer(local, remote) {
  return compareSemver(local, remote) < 0;
}

globalThis.compareSemver = compareSemver;
globalThis.isRemoteNewer = isRemoteNewer;
