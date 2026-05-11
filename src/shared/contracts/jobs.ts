import type { ScopeRef } from './projects';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

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
  /** Authoritative job listing scope. Defaults to the actor's personal scope. */
  scope?: ScopeRef;
  /** @deprecated Compatibility mirror of scope.type. Prefer scope. */
  scopeType?: ScopeRef['type'];
  /** @deprecated Compatibility mirror of scope.id. Prefer scope. */
  scopeId?: string;
  /**
   * @deprecated Non-authoritative compatibility context. Project requests
   * validate it against canonical project governance data; personal requests use
   * it only as an optional governance-space filter.
   */
  spaceId?: string;
}

export interface CreateJobRequest {
  credentialRef: string;
  kind: string;
  payload: Record<string, unknown>;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  requestedByUserId?: string;
  /**
   * Authoritative ownership scope. Defaults to the actor's personal scope for
   * compatibility when omitted by older callers.
   */
  scope?: ScopeRef;
  /**
   * @deprecated Non-authoritative compatibility context. Project-scoped jobs
   * validate it against the persisted Project.spaceId; personal jobs keep it as
   * governance/audit context only.
   */
  spaceId: string;
}

export interface JobRecord {
  createdAt: string;
  credentialRef: string;
  id: string;
  kind: string;
  /** Authoritative persisted ownership scope for this governed job. */
  scope: ScopeRef;
  /** Mirror of scope.type for older clients; scope remains authoritative. */
  scopeType: ScopeRef['type'];
  /** Mirror of scope.id for older clients; scope remains authoritative. */
  scopeId: string;
  /**
   * @deprecated Non-authoritative compatibility mirror. Project jobs mirror the
   * canonical project governance space; personal jobs mirror their stored
   * governance space context.
   */
  spaceId: string;
  status: JobStatus;
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

export interface RunJobRequest extends JobAccessQuery {
  jobId: string;
}

export const jobsContract = 'jixia-jobs-contract';
