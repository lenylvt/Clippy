import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../../features/theme/theme';

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
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.dangerIcon,
        { backgroundColor: c.dangerSoft },
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text style={{ color: c.danger, fontSize: 15, fontWeight: '700' }}>⌫</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dangerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.97 }] },
});
