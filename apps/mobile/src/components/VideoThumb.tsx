import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { youtubeThumbUrl } from '@clippy/shared/youtube';
import { useTheme } from '../features/theme/theme';

const THUMB_W = 72;
const THUMB_H = Math.round((THUMB_W * 9) / 16);

export function VideoThumb({
  videoId,
  style,
}: {
  videoId: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = youtubeThumbUrl(videoId, 'hq');

  useEffect(() => {
    setFailed(false);
  }, [videoId]);

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.wrap,
        {
          width: THUMB_W,
          height: THUMB_H,
          backgroundColor: c.surface,
          borderColor: c.outline,
        },
        style,
      ]}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible={false}
          accessibilityIgnoresInvertColors
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={[styles.placeholder, { backgroundColor: c.surface }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  placeholder: {
    ...StyleSheet.absoluteFill,
  },
});
