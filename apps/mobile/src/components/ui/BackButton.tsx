import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../../features/theme/theme';

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

export function BackButton({
  onPress,
  label = 'Retour',
  style,
}: {
  onPress: () => void;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Revient à l’écran précédent"
      style={({ pressed }) => [styles.backHit, pressed && styles.pressed, style]}
      onPress={onPress}
    >
      <Text
        selectable={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.backChevron, { color: c.ink }]}
      >
        ‹
      </Text>
      <Text selectable={false} style={[styles.backLabel, { color: c.ink }]}>
        {label}
      </Text>
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
  },
  backLabel: { fontSize: 17, fontWeight: '500' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
