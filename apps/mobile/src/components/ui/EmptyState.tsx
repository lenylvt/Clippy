import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../features/theme/theme';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: c.ink }]}>{title}</Text>
      {hint ? <Text style={[styles.emptyHint, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: 48, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: 14, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
});
