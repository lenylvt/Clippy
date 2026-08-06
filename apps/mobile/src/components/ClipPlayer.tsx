import { useEffect, useState } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../features/theme/theme';

const FULLSCREEN_OPTIONS = { enable: true } as const;

/** Lecteur clip — parent dimensionné (ex. aspectRatio 16/9). */
export function ClipPlayer({ url }: { url: string }) {
  const { c } = useTheme();
  const validUrl = typeof url === 'string' && url.trim().length > 0 ? url.trim() : '';
  const [error, setError] = useState<string | null>(validUrl ? null : 'URL manquante');

  const player = useVideoPlayer(validUrl || null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!validUrl) {
      setError('URL manquante');
      return;
    }
    setError(null);
  }, [validUrl]);

  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status, error: err }) => {
      if (status === 'error') {
        setError(err?.message ?? 'Lecture impossible');
      }
    });
    return () => {
      sub.remove();
    };
  }, [player]);

  if (!validUrl || error) {
    return (
      <View style={styles.fallback}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={validUrl ? 'Ouvrir la vidéo' : 'Lecture impossible'}
          style={styles.fallbackHit}
          onPress={() => {
            if (validUrl) void Linking.openURL(validUrl);
          }}
          disabled={!validUrl}
        >
          <Text selectable={false} style={[styles.fallbackText, { color: c.ink }]}>
            {error ?? 'Lecture impossible'}
          </Text>
          {validUrl ? (
            <Text selectable={false} style={[styles.fallbackHint, { color: c.muted }]}>
              Ouvrir la vidéo
            </Text>
          ) : null}
        </Pressable>
      </View>
    );
  }

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      nativeControls
      contentFit="contain"
      fullscreenOptions={FULLSCREEN_OPTIONS}
      accessibilityLabel="Lecteur du clip"
      accessibilityHint="Utilise les contrôles natifs pour lire la vidéo"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackHit: {
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  fallbackText: { fontWeight: '600', fontSize: 15, textAlign: 'center' },
  fallbackHint: { fontSize: 13, textAlign: 'center' },
});
