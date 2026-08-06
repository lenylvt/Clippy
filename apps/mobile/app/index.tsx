import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteClip, fetchMyClips } from '../src/api/clips';
import { fetchMyDevices } from '../src/api/pairing';
import { fetchMyJobs } from '../src/api/jobs';
import type { Clip, Job } from '../src/api/types';
import { useAuth } from '../src/features/auth/auth';
import { autoSaveAllPending } from '../src/features/save/autoSave';
import { groupClipsAndJobs } from '@clippy/shared/groupClips';
import { labelForStage } from '@clippy/shared/stages';
import { unmarkClipSaved } from '../src/features/save/savedClips';
import { useTheme } from '../src/features/theme/theme';
import { clipDuration, formatRange, formatTime, timelineSpan } from '@clippy/shared/time';
import { ClipTimeline } from '../src/components/ui/ClipTimeline';
import { JobProgressBar } from '../src/components/ui/JobProgressBar';
import { DangerIconButton } from '../src/components/ui/DangerIconButton';
import { EmptyState } from '../src/components/ui/EmptyState';
import { LoadingBlock } from '../src/components/ui/LoadingBlock';
import { VideoThumb } from '../src/components/VideoThumb';

export default function HomeScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { c, dark } = useTheme();
  const [clips, setClips] = useState<Clip[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pairedCount, setPairedCount] = useState(0);
  const [openVideos, setOpenVideos] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!token) return;
    const [cRes, jRes, dRes] = await Promise.all([
      fetchMyClips(token),
      fetchMyJobs(token, true),
      fetchMyDevices(token).catch(() => ({ devices: [] as { id: string }[] })),
    ]);
    setClips(cRes.clips);
    setJobs(jRes.jobs);
    setPairedCount(dRes.devices.length);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load().catch(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!token) return;
    void autoSaveAllPending(token).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void autoSaveAllPending(token).catch(() => undefined);
        void load().catch(() => undefined);
      }
    });
    return () => sub.remove();
  }, [token, load]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => void load().catch(() => undefined), 2500);
    return () => clearInterval(id);
  }, [token, load]);

  const groups = useMemo(() => groupClipsAndJobs(clips, jobs), [clips, jobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
      if (token) await autoSaveAllPending(token).catch(() => undefined);
    } finally {
      setRefreshing(false);
    }
  };

  const confirmDelete = (clipId: string) => {
    Alert.alert('Supprimer ce clip ?', 'Il sera retiré de Clippy (pas de Photos).', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => void onDelete(clipId),
      },
    ]);
  };

  const onDelete = async (clipId: string) => {
    if (!token) return;
    setClips((prev) => prev.filter((x) => x.id !== clipId));
    try {
      await deleteClip(token, clipId);
      await unmarkClipSaved(clipId);
    } catch {
      await load();
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.ink} />}
      >
        <View style={styles.top}>
          <Text style={[styles.brand, { color: c.ink }]}>Clippy</Text>
          <Pressable
            style={({ pressed }) => [styles.chip, { backgroundColor: c.surface }, pressed && styles.pressed]}
            onPress={() => router.push('/settings')}
          >
            <Text style={[styles.chipText, { color: c.ink }]}>Réglages</Text>
          </Pressable>
        </View>

        {loading && groups.length === 0 ? (
          <LoadingBlock label="Chargement des clips…" />
        ) : groups.length === 0 ? (
          <EmptyState
            title="Aucun clip pour l’instant"
            hint={
              pairedCount > 0
                ? 'Crée un clip depuis l’extension Chrome sur YouTube.'
                : 'Lie d’abord ton extension Chrome, puis découpe une vidéo.'
            }
          />
        ) : (
          groups.map((group) => {
            const open = openVideos[group.videoId] ?? true;
            const spanEnd = timelineSpan(
              group.items.map((item) =>
                item.kind === 'clip'
                  ? item.clip
                  : { clipEnd: item.job.clipEnd, videoDuration: null },
              ),
            );
            const total = group.items.length;
            const durationLabel = group.videoDuration ? formatTime(group.videoDuration) : null;
            const metaParts = [
              `${total} clip${total > 1 ? 's' : ''}`,
              group.jobCount > 0
                ? group.jobCount === 1
                  ? '1 en cours'
                  : `${group.jobCount} en cours`
                : null,
              durationLabel,
            ].filter(Boolean);

            return (
              <View
                key={group.videoId}
                style={[styles.group, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}
              >
                <Pressable
                  style={({ pressed }) => [styles.groupHead, pressed && styles.pressed]}
                  onPress={() =>
                    setOpenVideos((prev) => ({ ...prev, [group.videoId]: !open }))
                  }
                >
                  <VideoThumb videoId={group.videoId} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.groupTitle, { color: c.ink }]} numberOfLines={2}>
                      {group.videoTitle}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 13 }}>{metaParts.join(' · ')}</Text>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 16, fontWeight: '600' }}>
                    {open ? '▾' : '▸'}
                  </Text>
                </Pressable>

                {open
                  ? group.items.map((item) => {
                      if (item.kind === 'clip') {
                        const clip = item.clip;
                        const dur = clipDuration(clip.clipStart, clip.clipEnd);
                        return (
                          <View
                            key={clip.id}
                            style={[styles.clipRow, { borderTopColor: c.line }]}
                          >
                            <Pressable
                              style={({ pressed }) => [styles.clipMain, pressed && styles.pressed]}
                              onPress={() => router.push(`/clip/${clip.id}`)}
                            >
                              <View style={styles.clipTop}>
                                <View style={[styles.badge, { backgroundColor: c.surface }]}>
                                  <Text style={[styles.badgeText, { color: c.ink }]}>
                                    {item.index}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.clipTime, { color: c.ink }]}>
                                    {formatRange(clip.clipStart, clip.clipEnd)}
                                  </Text>
                                  <Text style={{ color: c.muted, fontSize: 12, marginTop: 2 }}>
                                    {formatTime(dur)} de clip
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.timelineWrap}>
                                <ClipTimeline
                                  start={clip.clipStart}
                                  end={clip.clipEnd}
                                  spanEnd={spanEnd}
                                  colors={c}
                                />
                              </View>
                            </Pressable>
                            <DangerIconButton onPress={() => confirmDelete(clip.id)} />
                          </View>
                        );
                      }

                      const job = item.job;
                      const dur = clipDuration(job.clipStart, job.clipEnd);
                      const stage = labelForStage(job.stage, job.progress);
                      const pct = Math.round(Math.min(1, Math.max(0, job.progress || 0)) * 100);
                      const busy = job.stage !== 'done' && job.stage !== 'error';
                      return (
                        <View
                          key={job.id}
                          style={[styles.clipRow, { borderTopColor: c.line }]}
                        >
                          <View style={styles.clipMain}>
                            <View style={styles.clipTop}>
                              <View style={[styles.badge, { backgroundColor: c.surface }]}>
                                <Text style={[styles.badgeText, { color: c.ink }]}>
                                  {item.index}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.clipTime, { color: c.ink }]}>
                                  {formatRange(job.clipStart, job.clipEnd)}
                                </Text>
                                <Text
                                  style={{
                                    color: job.stage === 'error' ? c.danger : c.muted,
                                    fontSize: 12,
                                    marginTop: 2,
                                  }}
                                  numberOfLines={2}
                                >
                                  {job.error
                                    ? job.error
                                    : busy
                                      ? `${stage} · ${pct}%`
                                      : `${formatTime(dur)} de clip`}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.timelineWrap}>
                              <JobProgressBar
                                stage={job.stage}
                                progress={job.progress}
                                colors={c}
                              />
                            </View>
                          </View>
                        </View>
                      );
                    })
                  : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  brand: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 },
  chipText: { fontSize: 13, fontWeight: '600' },
  pressed: { transform: [{ scale: 0.97 }] },
  group: {
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  groupTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  clipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  clipMain: { flex: 1, gap: 10 },
  clipTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  clipTime: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timelineWrap: { marginLeft: 36 },
});
