import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { labelForStage, queueBarWidth, stageToQueueStatus } from '@clippy/shared/stages';
import type { ThemeColors } from '../../features/theme/theme';
import { FILL_OPACITY, trackStyles } from './track';

/** Barre de progression dans le même emplacement que ClipTimeline (file d’attente). */
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
  const progressPct = Math.round(
    Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) * 100 : 0,
  );
  const valueNow = status === 'done' || status === 'error' ? 100 : progressPct;
  const anim = useRef(new Animated.Value(widthPct / 100)).current;
  const fill = status === 'error' ? colors.danger : colors.ink;

  useEffect(() => {
    let cancelled = false;
    let animation: Animated.CompositeAnimation | null = null;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      const toValue = widthPct / 100;
      if (reduce) {
        anim.setValue(toValue);
        return;
      }
      animation = Animated.timing(anim, {
        toValue,
        duration: 280,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      });
      animation.start();
    });

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [widthPct, anim]);

  return (
    <View
      style={[trackStyles.track, { backgroundColor: colors.line }]}
      accessibilityRole="progressbar"
      accessibilityLabel={labelForStage(stage)}
      accessibilityValue={{ min: 0, max: 100, now: valueNow }}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: fill,
            opacity: status === 'error' ? 1 : FILL_OPACITY,
            transform: [{ scaleX: anim }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    height: '100%',
    width: '100%',
    borderRadius: 99,
    transformOrigin: 'left center',
  },
});
