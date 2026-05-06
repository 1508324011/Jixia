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
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  actorUserId?: string;
}

export interface ListJobsQuery extends JobAccessQuery {
  spaceId?: string;
}

export interface CreateJobRequest {
  credentialRef: string;
  kind: string;
  payload: Record<string, unknown>;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  requestedByUserId?: string;
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
