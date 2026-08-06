import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentType, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteClip, fetchMyClips } from '../../src/api/clips';
import type { Clip } from '../../src/api/types';
import { useAuth } from '../../src/features/auth/auth';
import { hasNativeVideo } from '../../src/native/nativeCaps';
import { saveClipToPhotos } from '../../src/features/save/saveClip';
import { unmarkClipSaved } from '../../src/features/save/savedClips';
import { useTheme } from '../../src/features/theme/theme';
import { clipDuration, deleteButtonLabel, formatRange, formatTime, timelineSpan } from '@clippy/shared/time';
import { cleanTitle } from '@clippy/shared/title';
import { BackButton } from '../../src/components/ui/BackButton';
import { ClipTimeline } from '../../src/components/ui/ClipTimeline';
import { LoadingBlock } from '../../src/components/ui/LoadingBlock';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';

export default function ClipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const [clip, setClip] = useState<Clip | null>(null);
  const [siblings, setSiblings] = useState<Clip[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);
  const [Player, setPlayer] = useState<ComponentType<{ url: string }> | null>(null);

  useEffect(() => {
    if (!hasNativeVideo()) return;
    void import('../../src/components/ClipPlayer').then((m) => setPlayer(() => m.ClipPlayer));
  }, []);

  useEffect(() => {
    if (!token || !id) return;
    void fetchMyClips(token).then((res) => {
      const found = res.clips.find((x) => x.id === id) ?? null;
      setClip(found);
      setMissing(!found);
      if (found) {
        setSiblings(
          res.clips
            .filter((x) => x.videoId === found.videoId)
            .sort((a, b) => a.clipStart - b.clipStart || a.createdAt - b.createdAt),
        );
      }
    });
  }, [token, id]);

  const index = useMemo(() => {
    if (!clip) return 1;
    const i = siblings.findIndex((x) => x.id === clip.id);
    return i >= 0 ? i + 1 : 1;
  }, [clip, siblings]);

  const spanEnd = useMemo(
    () => timelineSpan(siblings.length ? siblings : clip ? [clip] : []),
    [siblings, clip],
  );

  const videoDurationLabel = useMemo(() => {
    const d = clip?.videoDuration ?? Math.max(0, ...siblings.map((s) => s.videoDuration ?? 0));
    return d > 0 ? formatTime(d) : null;
  }, [clip, siblings]);

  const onSave = async () => {
    if (!clip || saving) return;
    setSaving(true);
    setStatus(null);
    try {
      await saveClipToPhotos(clip.url, `clippy-${clip.id}.mp4`);
      setStatus('Enregistré dans Photos');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!clip || !token) return;
    Alert.alert('Supprimer ce clip ?', 'Il disparaîtra de Clippy.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteClip(token, clip.id);
              await unmarkClipSaved(clip.id);
              router.back();
            } catch (e) {
              setStatus(e instanceof Error ? e.message : 'Suppression impossible');
            }
          })();
        },
      },
    ]);
  };

  if (!clip && !missing) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <BackButton onPress={() => router.back()} />
        <LoadingBlock label="Ouverture du clip…" />
      </SafeAreaView>
    );
  }

  if (!clip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <BackButton onPress={() => router.back()} />
        <Text style={[styles.title, { color: c.ink }]}>Clip introuvable</Text>
        <SecondaryButton label="Retour à la liste" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const dur = clipDuration(clip.clipStart, clip.clipEnd);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BackButton onPress={() => router.back()} />

        <View style={styles.header}>
          <Text style={[styles.kicker, { color: c.muted }]}>
            Clip {index}
            {siblings.length > 1 ? ` / ${siblings.length}` : ''}
          </Text>
          <Text style={[styles.title, { color: c.ink }]} numberOfLines={3}>
            {cleanTitle(clip.videoTitle)}
          </Text>
        </View>

        <View style={[styles.player, { backgroundColor: c.surface }]}>
          {Player ? (
            <Player url={clip.url} />
          ) : (
            <Pressable style={styles.fallback} onPress={() => void Linking.openURL(clip.url)}>
              <Text style={{ color: c.ink, fontWeight: '600' }}>Ouvrir la vidéo</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.meta, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}>
          <Text style={[styles.metaTime, { color: c.ink }]}>
            {formatRange(clip.clipStart, clip.clipEnd)}
          </Text>
          <Text style={{ color: c.muted, fontSize: 13, marginTop: 4 }}>
            Clip {formatTime(dur)}
            {videoDurationLabel ? ` · vidéo ${videoDurationLabel}` : ''}
          </Text>
          <View style={{ marginTop: 12 }}>
            <ClipTimeline
              start={clip.clipStart}
              end={clip.clipEnd}
              spanEnd={spanEnd}
              colors={c}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Enregistrer dans Photos"
            busy={saving}
            onPress={() => void onSave()}
          />
          <SecondaryButton label={deleteButtonLabel(clip.expiresAt)} onPress={onDelete} />
        </View>
        {status ? <Text style={[styles.status, { color: c.muted }]}>{status}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20 },
  content: { paddingBottom: 40 },
  header: { marginBottom: 16 },
  kicker: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, lineHeight: 28 },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: {
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  metaTime: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  actions: { gap: 10 },
  status: { marginTop: 14, textAlign: 'center', fontSize: 14 },
});
