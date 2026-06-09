export type ScopeRef =
  | { type: "user"; id: string }
  | { type: "project"; id: string };

export type ProjectStatus = "active" | "archived";

export type ProjectMemberRole = "owner" | "editor" | "viewer";

export interface CreateProjectRequest {
  description?: string;
  name: string;
  spaceId: string;
  status?: ProjectStatus;
}

export interface ProjectLookup {
  projectId: string;
}

export interface ProjectRecord {
  id: string;
  spaceId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberRecord {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  joinedAt: string;
}

export interface ProjectListItem {
  memberCount: number;
  membership: ProjectMemberRecord;
  project: ProjectRecord;
}

export interface ProjectWorkspaceDocIndexItem {
  createdAt: string;
  createdByUserId: string;
  documentId: string;
  latestVersion: {
    capturedAt: string;
    versionId: string;
    versionNumber: number;
  } | null;
  openHref: string;
  projectId: string;
  publishState: "draft" | "review" | "published";
  title: string;
  updatedAt: string;
}

export interface ProjectWorkspaceDocsIndex {
  canCreate: boolean;
  createDisabledReason?: string;
  documents: ProjectWorkspaceDocIndexItem[];
  emptyState: {
    body: string;
    title: string;
  };
  projectId: string;
  totalCount: number;
}

export type ProjectWorkspaceActivityKind =
  | 'project-doc'
  | 'library-entry'
  | 'reader-comment'
  | 'reader-excerpt'
  | 'job';

export interface ProjectWorkspaceActivityItem {
  href?: string;
  id: string;
  kind: ProjectWorkspaceActivityKind;
  occurredAt: string;
  projectId: string;
  sourceId?: string;
  sourceLabel?: string;
  summary: string;
  title: string;
}

export interface ProjectWorkspaceActivitySection {
  emptyState: {
    body: string;
    title: string;
  };
  items: ProjectWorkspaceActivityItem[];
  projectId: string;
  totalCount: number;
}

export type ProjectWorkspaceReviewKind =
  | 'project-doc-review'
  | 'job-attention'
  | 'reader-comment'
  | 'reader-excerpt';

export type ProjectWorkspaceReviewPriority =
  | 'review'
  | 'attention'
  | 'monitor'
  | 'context';

export interface ProjectWorkspaceReviewItem {
  href?: string;
  id: string;
  kind: ProjectWorkspaceReviewKind;
  occurredAt: string;
  priority: ProjectWorkspaceReviewPriority;
  projectId: string;
  sourceId: string;
  sourceLabel: string;
  summary: string;
  title: string;
}

export interface ProjectWorkspaceReviewSummary {
  collaborationSignals: number;
  documentsInReview: number;
  jobsNeedingAttention: number;
  newestReviewTimestamp?: string;
  totalReviewItems: number;
}

export interface ProjectWorkspaceReviewSection {
  emptyState: {
    body: string;
    title: string;
  };
  items: ProjectWorkspaceReviewItem[];
  projectId: string;
  summary: ProjectWorkspaceReviewSummary;
  totalCount: number;
}

export type ProjectWorkspaceResourceKind =
  | 'project-doc'
  | 'library-entry'
  | 'reader-excerpt'
  | 'job';

export interface ProjectWorkspaceResourceItem {
  href?: string;
  id: string;
  kind: ProjectWorkspaceResourceKind;
  projectId: string;
  sourceId?: string;
  subtitle?: string;
  title: string;
  updatedAt?: string;
}

export interface ProjectWorkspaceResourcesSection {
  emptyState: {
    body: string;
    title: string;
  };
  items: ProjectWorkspaceResourceItem[];
  projectId: string;
  totalCount: number;
}

export interface ProjectWorkspaceResponse {
  activity: ProjectWorkspaceActivitySection;
  actor: {
    role: ProjectMemberRole;
    userId: string;
  };
  contract: typeof projectsContract;
  docs: ProjectWorkspaceDocsIndex;
  generatedAt: string;
  links: {
    libraryHref: string;
    projectHref: string;
    writerHref?: string;
  };
  membership: ProjectMemberRecord;
  project: ProjectRecord;
  review: ProjectWorkspaceReviewSection;
  resources: ProjectWorkspaceResourcesSection;
}

export interface AddProjectMemberRequest {
  role: ProjectMemberRole;
  userId: string;
}

export const projectsContract = "jixia-projects-contract";
