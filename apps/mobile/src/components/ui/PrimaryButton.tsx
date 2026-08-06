import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
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
  const inactive = !!(disabled || busy);
  const bg = tone === 'danger' ? c.danger : c.accent;
  const fg = tone === 'danger' ? '#FFFFFF' : c.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!busy }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg },
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
      onPress={onPress}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text selectable={false} style={[styles.btnText, { color: fg }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.4 },
});
