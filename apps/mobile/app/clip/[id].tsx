import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ComponentType, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteClip, fetchMyClips } from '../../src/api/clips';
import type { Clip } from '../../src/api/types';
import { useAuth } from '../../src/features/auth/auth';
import { hasNativeVideo } from '../../src/native/nativeCaps';
import { saveClipManually } from '../../src/features/save/autoSave';
import { getSavedClipIds, unmarkClipSaved } from '../../src/features/save/savedClips';
import { useTheme } from '../../src/features/theme/theme';
import { clipDuration, deleteButtonLabel, formatRange, formatTime, timelineSpan } from '@clippy/shared/time';
import { cleanTitle } from '@clippy/shared/title';
import { BackButton } from '../../src/components/ui/BackButton';
import { ClipTimeline } from '../../src/components/ui/ClipTimeline';
import { LoadingBlock } from '../../src/components/ui/LoadingBlock';
import { PrimaryButton } from '../../src/components/ui/PrimaryButton';
import { SecondaryButton } from '../../src/components/ui/SecondaryButton';
import { apiMessageFr } from '../../src/lib/apiMessages';
import { paramId } from '../../src/lib/paramId';
import { mapSaveError } from '../../src/features/save/saveClip';

export default function ClipScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = paramId(params.id);
  const { token } = useAuth();
  const router = useRouter();
  const { c, dark } = useTheme();
  const [clip, setClip] = useState<Clip | null>(null);
  const [siblings, setSiblings] = useState<Clip[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [statusDanger, setStatusDanger] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [Player, setPlayer] = useState<ComponentType<{ url: string }> | null>(null);
  const [playerReady, setPlayerReady] = useState(!hasNativeVideo());
  const loadGen = useRef(0);

  useEffect(() => {
    if (!hasNativeVideo()) {
      setPlayerReady(true);
      return;
    }
    void import('../../src/components/ClipPlayer')
      .then((m) => setPlayer(() => m.ClipPlayer))
      .catch(() => undefined)
      .finally(() => setPlayerReady(true));
  }, []);

  useEffect(() => {
    if (!token || !id) {
      if (!id) setMissing(true);
      return;
    }
    const gen = ++loadGen.current;
    setLoadError(null);
    void fetchMyClips(token)
      .then((res) => {
        if (gen !== loadGen.current) return;
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
      })
      .catch((e) => {
        if (gen !== loadGen.current) return;
        setLoadError(apiMessageFr(e, 'Impossible de charger le clip'));
        setMissing(true);
      });
  }, [token, id]);

  useEffect(() => {
    if (!id) return;
    void getSavedClipIds()
      .then((ids) => setAlreadySaved(ids.has(id)))
      .catch(() => undefined);
  }, [id]);

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
    setStatusDanger(false);
    try {
      await saveClipManually(clip);
      setAlreadySaved(true);
      setStatus('Enregistré dans Photos');
    } catch (e) {
      setStatusDanger(true);
      setStatus(apiMessageFr(e, mapSaveError(e)));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!clip || !token || deleting) return;
    Alert.alert('Supprimer ce clip ?', 'Il disparaîtra de Clippy.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const snapshot = clip;
            setDeleting(true);
            setClip(null);
            try {
              await deleteClip(token, snapshot.id);
              await unmarkClipSaved(snapshot.id);
              router.back();
            } catch (e) {
              setClip(snapshot);
              setDeleting(false);
              setStatusDanger(true);
              setStatus(apiMessageFr(e, 'Suppression impossible'));
            }
          })();
        },
      },
    ]);
  };

  if ((!clip && !missing && !loadError) || deleting) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <BackButton onPress={() => router.back()} />
        <LoadingBlock label={deleting ? 'Suppression…' : 'Ouverture du clip…'} />
      </SafeAreaView>
    );
  }

  if (!clip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <BackButton onPress={() => router.back()} />
        <Text style={[styles.title, { color: c.ink }]}>
          {loadError ? 'Chargement impossible' : 'Clip introuvable'}
        </Text>
        {loadError ? (
          <Text style={[styles.status, { color: c.danger, textAlign: 'left', marginBottom: 16 }]}>
            {loadError}
          </Text>
        ) : null}
        <SecondaryButton label="Retour à la liste" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const dur = clipDuration(clip.clipStart, clip.clipEnd);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
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
          ) : !playerReady ? (
            <View style={styles.fallback}>
              <Text style={{ color: c.muted }}>Chargement du lecteur…</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ouvrir la vidéo"
              style={styles.fallback}
              onPress={() => {
                void Linking.openURL(clip.url).catch(() => {
                  setStatusDanger(true);
                  setStatus('Impossible d’ouvrir la vidéo');
                });
              }}
            >
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
            label={alreadySaved ? 'Enregistrer à nouveau' : 'Enregistrer dans Photos'}
            busy={saving}
            onPress={() => void onSave()}
          />
          {alreadySaved ? (
            <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>
              Déjà enregistré dans Photos
            </Text>
          ) : null}
          <PrimaryButton
            label={deleteButtonLabel(clip.expiresAt)}
            tone="danger"
            disabled={deleting}
            onPress={onDelete}
          />
        </View>
        {status ? (
          <Text
            style={[styles.status, { color: statusDanger ? c.danger : c.muted }]}
            accessibilityLiveRegion="polite"
          >
            {status}
          </Text>
        ) : null}
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
