import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { queueBarWidth, stageToQueueStatus } from '@clippy/shared/stages';
import type { ThemeColors } from '../features/theme/theme';

/** Progress bar in the same slot as ClipTimeline (home row). */
export function JobProgressBar({
  stage,
  progress,
  colors,
}: {
  stage: string;
  progress: number;
  colors: ThemeColors;
}) {
  const status = stageToQueueStatus(stage);
  const widthPct = queueBarWidth(status, progress);
  const anim = useRef(new Animated.Value(widthPct)).current;
  const fill =
    status === 'error' ? colors.danger : status === 'done' ? colors.ink : colors.ink;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: widthPct,
      duration: 280,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [widthPct, anim]);

  return (
    <View
      style={[styles.track, { backgroundColor: colors.line }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: widthPct }}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: fill,
            opacity: status === 'error' ? 1 : 0.85,
            width: anim.interpolate({
              inputRange: [0, 100],
              outputRange: ['0%', '100%'],
            }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 99,
  },
});
