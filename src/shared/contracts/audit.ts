import type { ScopeRef } from './projects';

export type AuditMetadataValue = string | number | boolean | null;

export type AuditMetadata = Record<string, AuditMetadataValue>;

export interface AuditObjectRef {
  id: string;
  type: string;
}

export interface GovernanceAuditRecord {
  action: string;
  actorUserId: string;
  detail: string;
  id: string;
  jobId?: string;
  metadata?: AuditMetadata;
  object: AuditObjectRef;
  projectId?: string;
  recordedAt: string;
  scope: ScopeRef;
  spaceId?: string;
}

export interface ListProjectAuditQuery {
  objectId?: string;
  objectType?: string;
}

export const auditContract = 'jixia-governance-audit-v1';
