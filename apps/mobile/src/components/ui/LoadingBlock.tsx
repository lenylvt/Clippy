import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../features/theme/theme';

export function LoadingBlock({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View
      style={styles.loading}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityLabel={label}
    >
      <ActivityIndicator
        color={c.ink}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.loadingLabel, { color: c.muted }]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  loadingLabel: { fontSize: 14 },
});
