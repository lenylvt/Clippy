import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../features/theme/theme';

export function LoadingBlock({ label }: { label?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={c.ink} />
      {label ? <Text style={[styles.loadingLabel, { color: c.muted }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  loadingLabel: { fontSize: 14 },
});
