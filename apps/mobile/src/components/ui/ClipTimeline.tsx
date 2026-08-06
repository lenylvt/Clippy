import { StyleSheet, View } from 'react-native';
import type { ThemeColors } from '../../features/theme/theme';

/** Mini timeline: filled segment = clip in video span. */
export function ClipTimeline({
  start,
  end,
  spanEnd,
  colors,
}: {
  start: number;
  end: number;
  spanEnd: number;
  colors: ThemeColors;
}) {
  const span = Math.max(spanEnd, end, 1);
  const left = Math.min(1, Math.max(0, start / span));
  const width = Math.min(1 - left, Math.max(0.02, (end - start) / span));
  return (
    <View
      style={[styles.timelineTrack, { backgroundColor: colors.line }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.timelineFill,
          {
            left: `${left * 100}%`,
            width: `${width * 100}%`,
            backgroundColor: colors.ink,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  timelineTrack: {
    height: 4,
    borderRadius: 99,
    overflow: 'hidden',
    position: 'relative',
  },
  timelineFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 99,
  },
});
