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

export interface JobAuditRecord {
  action: string;
  actorUserId: string;
  detail: string;
  id: string;
  jobId?: string;
  recordedAt: string;
  spaceId: string;
}

export interface GovernedJobView {
  audits: JobAuditRecord[];
  events: JobEventRecord[];
  job: JobRecord;
}

export interface GovernedJobResponse {
  governedJob: GovernedJobView | null;
}

export const jobsContract = 'jixia-jobs-contract';
