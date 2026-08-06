import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet } from 'react-native';

export function ClipPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}
