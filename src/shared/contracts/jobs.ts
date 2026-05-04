export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface JobStatusQuery {
  jobId: string;
}

export interface JobAccessQuery {
  actorSpaceId: string;
  actorUserId: string;
}

export interface ListJobsQuery extends JobAccessQuery {}

export interface CreateJobRequest {
  credentialRef: string;
  kind: string;
  payload: Record<string, unknown>;
  requestedByUserId: string;
  spaceId: string;
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

export interface RunJobRequest extends JobAccessQuery {
  jobId: string;
}

export const jobsContract = "jixia-jobs-contract";
