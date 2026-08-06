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
import { deleteJob, fetchMyJobs } from '../src/api/jobs';
import type { Job } from '../src/api/types';
import { useAuth } from '../src/features/auth/auth';
import { useTheme } from '../src/features/theme/theme';
import { groupClipsAndJobs } from '@clippy/shared/groupClips';
import { labelForStage } from '@clippy/shared/stages';
import { clipDuration, formatRange, formatTime } from '@clippy/shared/time';
import { BackButton } from '../src/components/ui/BackButton';
import { DangerIconButton } from '../src/components/ui/DangerIconButton';
import { EmptyState } from '../src/components/ui/EmptyState';
import { LoadingBlock } from '../src/components/ui/LoadingBlock';
import { JobProgressBar } from '../src/components/ui/JobProgressBar';
import { VideoThumb } from '../src/components/VideoThumb';
import { apiMessageFr } from '../src/lib/apiMessages';
import { filterVisibleHomeJobs } from '../src/lib/homeJobs';

const POLL_BUSY_MS = 2500;

export default function ActivityScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { c, dark } = useTheme();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openVideos, setOpenVideos] = useState<Record<string, boolean>>({});
  const loadGen = useRef(0);
  const pendingJobDeletes = useRef(new Set<string>());
  const appActiveRef = useRef(AppState.currentState === 'active');

  const load = useCallback(async () => {
    if (!token) return;
    const gen = ++loadGen.current;
    try {
      const list = filterVisibleHomeJobs((await fetchMyJobs(token, false)).jobs).filter(
        (j) => !pendingJobDeletes.current.has(j.id),
      );
      if (gen !== loadGen.current) return;
      setJobs(list);
      setLoadError(null);
    } catch (e) {
      if (gen !== loadGen.current) return;
      setLoadError(apiMessageFr(e, 'Impossible de charger l’activité'));
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!token) return;
    const onChange = (state: AppStateStatus) => {
      appActiveRef.current = state === 'active';
      if (state === 'active') void load();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [token, load]);

  const busyCount = useMemo(
    () => jobs.filter((j) => j.stage !== 'done' && j.stage !== 'error').length,
    [jobs],
  );
  const polling = busyCount > 0;

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
        await load();
      } catch {
        /* loadError */
      }
      if (!cancelled && id === requestId) schedule();
    };

    schedule();
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [token, polling, load]);

  const groups = useMemo(() => groupClipsAndJobs([], jobs), [jobs]);

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
      await load().catch(() => undefined);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} />
        <Text style={[styles.title, { color: c.ink }]} accessibilityRole="header">
          En cours
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await load();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={c.ink}
          />
        }
      >
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
          <LoadingBlock label="Chargement…" />
        ) : groups.length === 0 ? (
          <EmptyState title="Rien en cours" hint="Quand tu crées un clip, il apparaît ici." />
        ) : (
          groups.map((group) => {
            const open = openVideos[group.videoId] ?? true;
            const groupBusy = group.items.filter(
              (i) => i.kind === 'job' && i.job.stage !== 'done' && i.job.stage !== 'error',
            ).length;
            const groupErrors = group.items.filter(
              (i) => i.kind === 'job' && (i.job.stage === 'error' || i.job.status === 'error'),
            ).length;
            const meta =
              [
                groupBusy > 0 ? `${groupBusy} en cours` : null,
                groupErrors > 0
                  ? `${groupErrors} échec${groupErrors > 1 ? 's' : ''}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || `${group.jobCount} job${group.jobCount > 1 ? 's' : ''}`;

            return (
              <View
                key={group.videoId}
                style={[styles.group, { backgroundColor: c.surfaceRaised, borderColor: c.line }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${group.videoTitle}, ${meta}`}
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
                    <Text style={{ color: c.muted, fontSize: 13 }}>{meta}</Text>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 16, fontWeight: '600' }}>
                    {open ? '▾' : '▸'}
                  </Text>
                </Pressable>

                {open
                  ? group.items.map((item) => {
                      if (item.kind !== 'job') return null;
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
  header: { paddingHorizontal: 20, paddingTop: 4, marginBottom: 14 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
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
