import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMyJobs } from '../src/api/jobs';
import type { Job } from '../src/api/types';
import { useAuth } from '../src/features/auth/auth';
import { useTheme } from '../src/features/theme/theme';
import { groupClipsAndJobs } from '@clippy/shared/groupClips';
import { labelForStage } from '@clippy/shared/stages';
import { clipDuration, formatRange, formatTime } from '@clippy/shared/time';
import { BackButton } from '../src/components/ui/BackButton';
import { EmptyState } from '../src/components/ui/EmptyState';
import { LoadingBlock } from '../src/components/ui/LoadingBlock';
import { JobProgressBar } from '../src/components/ui/JobProgressBar';
import { VideoThumb } from '../src/components/VideoThumb';

export default function ActivityScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openVideos, setOpenVideos] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!token) return;
    const list = (await fetchMyJobs(token, true)).jobs;
    setJobs(list);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load().catch(() => setLoading(false));
    const id = setInterval(() => void load().catch(() => undefined), 1500);
    return () => clearInterval(id);
  }, [load]);

  const groups = useMemo(() => groupClipsAndJobs([], jobs), [jobs]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.bg }]}>
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
        <BackButton onPress={() => router.back()} />
        <Text style={[styles.title, { color: c.ink }]}>En cours</Text>
        <Text style={[styles.sub, { color: c.muted }]}>
          Clips en préparation, groupés par vidéo.
        </Text>

        {loading && groups.length === 0 ? (
          <LoadingBlock label="Chargement…" />
        ) : groups.length === 0 ? (
          <EmptyState title="Rien en cours" hint="Quand tu crées un clip, il apparaît ici." />
        ) : (
          groups.map((group) => {
            const open = openVideos[group.videoId] ?? true;
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
                    <Text style={{ color: c.muted, fontSize: 13 }}>
                      {group.jobCount} en cours
                    </Text>
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
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, marginBottom: 4 },
  sub: { fontSize: 14, marginBottom: 18 },
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
