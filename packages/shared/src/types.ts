export type Clip = {
  id: string;
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
  videoDuration: number | null;
  createdAt: number;
  expiresAt: number;
  url: string;
  extension: string;
};

export type Job = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  videoId: string;
  videoTitle: string;
  youtubeUrl: string;
  clipStart: number;
  clipEnd: number;
  clipId: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  url?: string;
};

/** Alias used by the worker API layer. */
export type JobPublic = Job;
