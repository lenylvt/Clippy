import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../features/theme/theme';

export function BackButton({ onPress, label = 'Retour' }: { onPress: () => void; label?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.backHit, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={[styles.backChevron, { color: c.ink }]}>‹</Text>
      <Text style={[styles.backLabel, { color: c.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backHit: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 8,
    gap: 2,
  },
  backChevron: {
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
    marginTop: -2,
    marginLeft: -4,
  },
  backLabel: { fontSize: 17, fontWeight: '500' },
  pressed: { transform: [{ scale: 0.97 }] },
});
