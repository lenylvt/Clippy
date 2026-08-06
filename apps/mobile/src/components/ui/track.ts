import { StyleSheet } from 'react-native';

/** Hauteur partagée ClipTimeline / JobProgressBar. */
export const TRACK_HEIGHT = 4;

export const FILL_OPACITY = 0.85;

export const trackStyles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 99,
    overflow: 'hidden',
  },
});
