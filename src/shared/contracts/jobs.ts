export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface JobStatusQuery {
  jobId: string;
}

export interface JobRecord {
  id: string;
  kind: string;
  status: JobStatus;
  credentialRef: string;
  createdAt: string;
}

export interface JobEventRecord {
  id: string;
  jobId: string;
  status: JobStatus;
  message: string;
  recordedAt: string;
}

export const jobsContract = 'jixia-jobs-contract';
