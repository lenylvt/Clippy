import { StyleSheet, View, type DimensionValue } from 'react-native';
import type { ThemeColors } from '../../features/theme/theme';
import { clipTimelineLayout, pct } from './clipTimelineLayout';
import { trackStyles } from './track';

/** Mini-timeline : segment rempli = clip dans la durée vidéo. */
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
  const { left, width } = clipTimelineLayout(start, end, spanEnd);
  return (
    <View
      style={[trackStyles.track, styles.timelineTrack, { backgroundColor: colors.line }]}
      // iOS + Android : masquer la décoration aux lecteurs d’écran
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View
        style={[
          styles.timelineFill,
          {
            left: pct(left) as DimensionValue,
            width: pct(width) as DimensionValue,
            backgroundColor: colors.ink,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  timelineTrack: {
    position: 'relative',
  },
  timelineFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 99,
  },
});
