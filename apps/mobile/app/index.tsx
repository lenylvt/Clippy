import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  type AppStateStatus,
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
import { deleteJob, fetchMyJobs } from '../src/api/jobs';
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
import { SecondaryButton } from '../src/components/ui/SecondaryButton';
import { VideoThumb } from '../src/components/VideoThumb';
import { apiMessageFr } from '../src/lib/apiMessages';
import { filterVisibleHomeJobs } from '../src/lib/homeJobs';

const POLL_BUSY_MS = 2500;

export default function HomeScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { c, dark } = useTheme();
  const [clips, setClips] = useState<Clip[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pairedCount, setPairedCount] = useState(0);
  const [pairedUnknown, setPairedUnknown] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openVideos, setOpenVideos] = useState<Record<string, boolean>>({});
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadGen = useRef(0);
  const pendingDeletes = useRef(new Set<string>());
  const pendingJobDeletes = useRef(new Set<string>());
  const appActiveRef = useRef(AppState.currentState === 'active');

  const loadStable = useCallback(async () => {
    if (!token) return;
    const gen = ++loadGen.current;
    const [cRes, jRes, dRes] = await Promise.allSettled([
      fetchMyClips(token),
      fetchMyJobs(token, false),
      fetchMyDevices(token),
    ]);

    if (gen !== loadGen.current) return;

    let gotClips = false;
    let gotJobs = false;

    if (cRes.status === 'fulfilled') {
      gotClips = true;
      setClips(cRes.value.clips.filter((x) => !pendingDeletes.current.has(x.id)));
    }
    if (jRes.status === 'fulfilled') {
      gotJobs = true;
      setJobs(
        filterVisibleHomeJobs(jRes.value.jobs).filter(
          (j) => !pendingJobDeletes.current.has(j.id),
        ),
      );
    }
    if (dRes.status === 'fulfilled') {
      setPairedCount(dRes.value.devices.length);
      setPairedUnknown(false);
    } else {
      setPairedUnknown(true);
    }

    setLoadError(
      !gotClips && !gotJobs
        ? 'Impossible de charger. Tire pour réessayer.'
        : !gotClips || !gotJobs
          ? 'Actualisation partielle — certaines données manquent.'
          : null,
    );
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadStable().catch(() => setLoading(false));
  }, [loadStable]);

  useEffect(() => {
    if (!token) return;
    void autoSaveAllPending(token).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const onChange = (state: AppStateStatus) => {
      appActiveRef.current = state === 'active';
      if (state === 'active') {
        void autoSaveAllPending(token).catch(() => undefined);
        void loadStable().catch(() => undefined);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [token, loadStable]);

  const busyCount = useMemo(
    () => jobs.filter((j) => j.stage !== 'done' && j.stage !== 'error').length,
    [jobs],
  );
  const errorJobCount = useMemo(
    () => jobs.filter((j) => j.stage === 'error' || j.status === 'error').length,
    [jobs],
  );
  const polling = busyCount > 0;

  // Sequential poll only while there are busy jobs and the app is foregrounded.
  useEffect(() => {
    if (!token || !polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestId = 0;

    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clearTimer();
      if (cancelled || !appActiveRef.current) return;
      timer = setTimeout(() => {
        void tick();
      }, POLL_BUSY_MS);
    };

    const tick = async () => {
      if (cancelled || !appActiveRef.current) return;
      const id = ++requestId;
      try {
        await loadStable();
      } catch {
        /* loadError */
      }
      if (!cancelled && id === requestId) schedule();
    };

    schedule();

    const sub = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
      if (state === 'active') {
        void tick();
      } else {
        clearTimer();
      }
    });

    return () => {
      cancelled = true;
      clearTimer();
      sub.remove();
    };
  }, [token, polling, loadStable]);

  const groups = useMemo(() => groupClipsAndJobs(clips, jobs), [clips, jobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadStable();
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

  const confirmDeleteJob = (jobId: string) => {
    Alert.alert('Supprimer cet échec ?', 'Il disparaîtra de la liste.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => void onDeleteJob(jobId),
      },
    ]);
  };

  const onDelete = async (clipId: string) => {
    if (!token) return;
    setDeleteError(null);
    pendingDeletes.current.add(clipId);
    setClips((prev) => prev.filter((x) => x.id !== clipId));
    try {
      await deleteClip(token, clipId);
      await unmarkClipSaved(clipId);
      pendingDeletes.current.delete(clipId);
    } catch (e) {
      pendingDeletes.current.delete(clipId);
      setDeleteError(apiMessageFr(e, 'Suppression impossible'));
      await loadStable().catch(() => undefined);
    }
  };

  const onDeleteJob = async (jobId: string) => {
    if (!token) return;
    setDeleteError(null);
    pendingJobDeletes.current.add(jobId);
    setJobs((prev) => prev.filter((x) => x.id !== jobId));
    try {
      await deleteJob(token, jobId);
      pendingJobDeletes.current.delete(jobId);
    } catch (e) {
      pendingJobDeletes.current.delete(jobId);
      setDeleteError(apiMessageFr(e, 'Suppression impossible'));
      await loadStable().catch(() => undefined);
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
          <Text style={[styles.brand, { color: c.ink }]} accessibilityRole="header">
            Clippy
          </Text>
          <View style={styles.topActions}>
            {busyCount > 0 || errorJobCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voir l’activité"
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: c.surface },
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push('/activity')}
              >
                <Text style={[styles.chipText, { color: c.ink }]}>
                  {busyCount > 0
                    ? `${busyCount} en cours`
                    : `${errorJobCount} échec${errorJobCount > 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Réglages"
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: c.surface },
                pressed && styles.pressed,
              ]}
              onPress={() => router.push('/settings')}
            >
              <Text style={[styles.chipText, { color: c.ink }]}>Réglages</Text>
            </Pressable>
          </View>
        </View>

        {loadError ? (
          <Text style={[styles.banner, { color: c.danger }]} accessibilityLiveRegion="polite">
            {loadError}
          </Text>
        ) : null}
        {deleteError ? (
          <Text style={[styles.banner, { color: c.danger }]} accessibilityLiveRegion="polite">
            {deleteError}
          </Text>
        ) : null}

        {loading && groups.length === 0 ? (
          <LoadingBlock label="Chargement des clips…" />
        ) : groups.length === 0 ? (
          <View style={{ gap: 14 }}>
            <EmptyState
              title="Aucun clip pour l’instant"
              hint={
                pairedUnknown
                  ? 'Crée un clip depuis l’extension Chrome sur YouTube.'
                  : pairedCount > 0
                    ? 'Crée un clip depuis l’extension Chrome sur YouTube.'
                    : 'Lie d’abord ton extension Chrome, puis découpe une vidéo.'
              }
            />
            {!pairedUnknown && pairedCount === 0 ? (
              <SecondaryButton label="Lier Chrome" onPress={() => router.push('/scan')} />
            ) : null}
          </View>
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
            const groupBusy = group.items.filter(
              (i) => i.kind === 'job' && i.job.stage !== 'done' && i.job.stage !== 'error',
            ).length;
            const groupErrors = group.items.filter(
              (i) => i.kind === 'job' && (i.job.stage === 'error' || i.job.status === 'error'),
            ).length;
            const metaParts = [
              `${total} clip${total > 1 ? 's' : ''}`,
              groupBusy > 0
                ? groupBusy === 1
                  ? '1 en cours'
                  : `${groupBusy} en cours`
                : null,
              groupErrors > 0
                ? groupErrors === 1
                  ? '1 échec'
                  : `${groupErrors} échecs`
                : null,
              durationLabel,
            ].filter(Boolean);

            return (
              <View
                key={group.videoId}
                style={[styles.group, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${group.videoTitle}, ${metaParts.join(', ')}`}
                  style={({ pressed }) => [styles.groupHead, pressed && styles.pressed]}
                  onPress={() =>
                    setOpenVideos((prev) => ({ ...prev, [group.videoId]: !open }))
                  }
                >
                  <VideoThumb videoId={group.videoId} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.groupTitle, { color: c.ink }]} numberOfLines={2}>
                      {group.videoTitle}
                    </Text>
                    <Text style={{ color: c.muted, fontSize: 13 }}>{metaParts.join(' · ')}</Text>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 16, fontWeight: '600' }} aria-hidden>
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
                              accessibilityRole="button"
                              accessibilityLabel={`Clip ${item.index}, ${formatRange(clip.clipStart, clip.clipEnd)}`}
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
                      const isError = job.stage === 'error' || job.status === 'error';
                      const busy = !isError && job.stage !== 'done';
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
                                    color: isError ? c.danger : c.muted,
                                    fontSize: 12,
                                    marginTop: 2,
                                  }}
                                  numberOfLines={2}
                                >
                                  {isError
                                    ? job.error
                                      ? apiMessageFr(job.error, job.error)
                                      : 'Échec de la préparation'
                                    : busy
                                      ? `${stage} · ${pct}%`
                                      : job.stage === 'done'
                                        ? 'Terminé'
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
                          {isError ? (
                            <DangerIconButton onPress={() => confirmDeleteJob(job.id)} />
                          ) : null}
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  chipText: { fontSize: 13, fontWeight: '600' },
  banner: { fontSize: 13, marginBottom: 12, textAlign: 'center' },
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
