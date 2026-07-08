function pickRecorderMimeType() {
  const candidates = [
    'video/mp4',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

globalThis.pickRecorderMimeType = pickRecorderMimeType;
