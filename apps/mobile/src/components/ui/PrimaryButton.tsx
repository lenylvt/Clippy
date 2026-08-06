import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../features/theme/theme';

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  tone = 'accent',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: 'accent' | 'danger';
}) {
  const { c } = useTheme();
  const bg = tone === 'danger' ? c.danger : c.accent;
  const fg = tone === 'danger' ? '#FFFFFF' : c.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg },
        pressed && !disabled && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.btnText, { color: fg }]}>{busy ? '…' : label}</Text>
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
  btnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },
});
