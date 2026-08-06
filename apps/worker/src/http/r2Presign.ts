/**
 * Presign a short-lived R2 PutObject URL (S3-compatible).
 * Requires R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY on the Worker.
 *
 * The PUT client MUST send header `x-amz-content-sha256: UNSIGNED-PAYLOAD`
 * (and the same `Content-Type` that was signed).
 */

const DEFAULT_EXPIRES_SECONDS = 900;
const MIN_EXPIRES_SECONDS = 1;
const MAX_EXPIRES_SECONDS = 604_800; // 7 days (S3/R2 max)
const CONTENT_TYPE_RE = /^[\w.+-]+\/[\w.+-]+$/;
/** Safe R2 key segments (no empty, no `.`/`..`, no `//`). */
const R2_KEY_RE = /^(?:[a-zA-Z0-9!_.*'()-]+)(?:\/[a-zA-Z0-9!_.*'()-]+)*$/;

export async function presignR2Put(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  contentType?: string;
  expiresSeconds?: number;
}): Promise<string> {
  const expires = normalizeExpires(opts.expiresSeconds);
  const contentType = normalizeContentType(opts.contentType);
  const key = normalizeR2Key(opts.key);
  const bucket = opts.bucket.trim();
  if (!bucket || /[/\s]/.test(bucket)) {
    throw new Error('invalid_r2_bucket');
  }

  const host = `${opts.accountId.trim()}.r2.cloudflarestorage.com`;
  const path = `/${awsEncode(bucket)}/${key.split('/').map(awsEncode).join('/')}`;
  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const credential = `${opts.accessKeyId}/${credentialScope}`;

  const signedHeaders = 'content-type;host;x-amz-content-sha256';
  const queryParams: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', credential],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expires)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ];
  queryParams.sort((a, b) => a[0].localeCompare(b[0]));

  const canonicalQuery = queryParams
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .join('&');

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:UNSIGNED-PAYLOAD\n`;

  const canonicalRequest = [
    'PUT',
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSignatureKey(opts.secretAccessKey, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);
  const finalQuery = `${canonicalQuery}&${awsEncode('X-Amz-Signature')}=${awsEncode(signature)}`;

  return `https://${host}${path}?${finalQuery}`;
}

function normalizeExpires(value: number | undefined): number {
  const expires = value ?? DEFAULT_EXPIRES_SECONDS;
  if (!Number.isInteger(expires) || expires < MIN_EXPIRES_SECONDS || expires > MAX_EXPIRES_SECONDS) {
    throw new Error('invalid_expires_seconds');
  }
  return expires;
}

function normalizeContentType(value: string | undefined): string {
  const contentType = (value ?? 'video/mp4').trim();
  if (!CONTENT_TYPE_RE.test(contentType)) {
    throw new Error('invalid_content_type');
  }
  return contentType;
}

function normalizeR2Key(key: string): string {
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > 1024 || !R2_KEY_RE.test(trimmed)) {
    throw new Error('invalid_r2_key');
  }
  for (const segment of trimmed.split('/')) {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error('invalid_r2_key');
    }
  }
  return trimmed;
}

/** RFC 3986 encoding required by AWS SigV4 (not form-urlencoded). */
function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

export function canPresignR2(env: {
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
}): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID?.trim() &&
      env.R2_ACCESS_KEY_ID?.trim() &&
      env.R2_SECRET_ACCESS_KEY?.trim(),
  );
}

function toAmzDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const h = d.getUTCHours().toString().padStart(2, '0');
  const min = d.getUTCMinutes().toString().padStart(2, '0');
  const s = d.getUTCSeconds().toString().padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hash);
}

async function hmac(key: BufferSource, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function hmacHex(key: BufferSource, message: string): Promise<string> {
  return bufferToHex(await hmac(key, message));
}

async function getSignatureKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<ArrayBuffer> {
  const kDate = await hmac(new TextEncoder().encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0');
  }
  return out;
}
