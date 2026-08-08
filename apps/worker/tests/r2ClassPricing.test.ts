import { describe, expect, it } from 'vitest';

/** Mirrors classifyR2Action in cfAnalytics — Class A/B from CF pricing docs. */
const R2_CLASS_A = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
]);

const R2_CLASS_B = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);

function classify(actionType: string): 'A' | 'B' | 'free' | 'unknown' {
  if (R2_CLASS_A.has(actionType)) return 'A';
  if (R2_CLASS_B.has(actionType)) return 'B';
  if (
    actionType === 'DeleteObject' ||
    actionType === 'DeleteBucket' ||
    actionType === 'AbortMultipartUpload'
  ) {
    return 'free';
  }
  return 'unknown';
}

describe('R2 Class A/B classification', () => {
  it('maps ListObjects and PutObject to Class A', () => {
    expect(classify('ListObjects')).toBe('A');
    expect(classify('PutObject')).toBe('A');
    expect(classify('UploadPart')).toBe('A');
  });

  it('maps GetObject and HeadObject to Class B', () => {
    expect(classify('GetObject')).toBe('B');
    expect(classify('HeadObject')).toBe('B');
  });

  it('maps DeleteObject as free', () => {
    expect(classify('DeleteObject')).toBe('free');
  });

  it('sums like the Cloudflare dashboard example', () => {
    const ops = {
      ListObjects: 50,
      PutObject: 60,
      GetObject: 500,
      HeadObject: 100,
    };
    let a = 0;
    let b = 0;
    for (const [action, n] of Object.entries(ops)) {
      const k = classify(action);
      if (k === 'A') a += n;
      if (k === 'B') b += n;
    }
    expect(a).toBe(110);
    expect(b).toBe(600);
  });
});
