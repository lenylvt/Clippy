import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { youtubeThumbUrl } from '@clippy/shared/youtube';
import { useTheme } from '../features/theme/theme';

export function VideoThumb({
  videoId,
  style,
  size = 'md',
}: {
  videoId: string;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = youtubeThumbUrl(videoId, size === 'lg' ? 'hq' : 'mq');
  const dim = size === 'sm' ? { w: 56, h: 32 } : size === 'lg' ? { w: 112, h: 63 } : { w: 72, h: 40 };

  return (
    <View
      style={[
        styles.wrap,
        {
          width: dim.w,
          height: dim.h,
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
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
