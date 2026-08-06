import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../features/theme/theme';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

export function DangerIconButton({
  onPress,
  label = 'Supprimer',
}: {
  onPress: () => void;
  label?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Suppression définitive"
      style={({ pressed }) => [
        styles.dangerIcon,
        { backgroundColor: c.dangerSoft },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text selectable={false} style={[styles.icon, { color: c.danger }]}>
        ×
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dangerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
    marginTop: -1,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
