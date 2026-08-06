import type { Job } from '../api/types';

/** Jobs shown on home / activity: in-flight + recent failures (not only ?active=1). */
export function isVisibleHomeJob(job: Job): boolean {
  if (job.status === 'error' || job.stage === 'error') return true;
  if (job.status === 'queued' || job.status === 'running') return true;
  return false;
}

export function filterVisibleHomeJobs(jobs: Job[]): Job[] {
  return jobs.filter(isVisibleHomeJob);
}

export function hasBusyJobs(jobs: Job[]): boolean {
  return jobs.some((j) => j.status === 'queued' || j.status === 'running');
}
