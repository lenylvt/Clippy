import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../features/theme/theme';

export function SecondaryButton({
  label,
  onPress,
  disabled,
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        styles.btnSecondary,
        compact && styles.btnCompact,
        { backgroundColor: c.surface, borderColor: c.line },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.btnText, compact && styles.btnTextCompact, { color: c.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnCompact: {
    borderRadius: 10,
    paddingVertical: 9,
  },
  btnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  btnTextCompact: {
    fontSize: 14,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },
});
