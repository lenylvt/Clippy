export type { Clip, Job } from '@clippy/shared/types';

export type PairedDevice = {
  id: string;
  label: string;
  pairedAt: number | null;
};
