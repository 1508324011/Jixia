import type {
  ProjectWorkspaceActivityItem,
  ProjectWorkspaceDocIndexItem,
  ProjectWorkspaceReviewItem,
  ProjectWorkspaceReviewSection,
  ProjectWorkspaceResourceItem,
  ProjectWorkspaceResponse,
} from '@shared/contracts/projects';
import { projectsContract } from '@shared/contracts/projects';

import type {
  JobRepository,
  LibraryRepository,
  ProjectDocRepository,
  ProjectRepository,
  ReadingRepository,
  PersistedProjectDocIndexItem,
  PersistedJobRecord,
  PersistedLibraryEntryView,
  PersistedProjectReadingCommentRecord,
  PersistedReaderExcerptRecord,
} from '../../db';

export interface ProjectWorkspaceStore {
  jobRepository: JobRepository;
  libraryRepository: LibraryRepository;
  projectDocRepository: ProjectDocRepository;
  projectRepository: ProjectRepository;
  readingRepository: ReadingRepository;
}

export interface ProjectWorkspaceService {
  getWorkspace(projectId: string, actorUserId: string): Promise<ProjectWorkspaceResponse>;
}

const emptyProjectDocsIndex = {
  body: 'No Project Docs have been created for this project yet. Use Project Docs to maintain shared background, evidence, rationale, conclusions, and formal drafts for the team.',
  title: 'No Project Docs yet',
};

const emptyProjectActivitySection = {
  body: 'Project activity will appear when Project Docs, project Library entries, Reader comments or excerpts, and governed project jobs change.',
  title: 'No project activity yet',
};

const emptyProjectResourcesSection = {
  body: 'Project resources will appear when the team creates Project Docs, adopts literature into the project-scoped Library, captures Reader excerpts, or opens governed jobs.',
  title: 'No project resources yet',
};

const emptyProjectReviewSection = {
  body: 'Project review and attention items will appear when shared Project Docs enter review, project jobs need monitoring, or project Reader collaboration creates comments and excerpts.',
  title: 'No project review items yet',
};

const projectWorkspaceActivityLimit = 8;
const projectWorkspaceReviewLimit = 8;

function sortTimestamp(value?: string): number {
  return value ? new Date(value).getTime() : 0;
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength = 96): string {
  const normalized = sanitizeText(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function resolveDocsCreatePermissions(role: string): {
  canCreate: boolean;
  createDisabledReason?: string;
} {
  if (role === 'owner' || role === 'editor') {
    return { canCreate: true };
  }

  return {
    canCreate: false,
    createDisabledReason: 'Project viewers can read visible Project Docs but cannot create shared project knowledge documents.',
  };
}

function mapDocIndexItem(
  item: PersistedProjectDocIndexItem,
): ProjectWorkspaceDocIndexItem {
  return {
    createdAt: item.document.createdAt,
    createdByUserId: item.document.createdByUserId,
    documentId: item.document.id,
    latestVersion: item.latestVersion,
    openHref: `/projects/${item.document.projectId}/writing/${item.document.id}`,
    projectId: item.document.projectId,
    publishState: item.document.publishState,
    title: item.document.title,
    updatedAt: item.document.updatedAt,
  };
}

function compareWorkspaceActivityItems(
  left: ProjectWorkspaceActivityItem,
  right: ProjectWorkspaceActivityItem,
): number {
  const rightTime = new Date(right.occurredAt).getTime();
  const leftTime = new Date(left.occurredAt).getTime();

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  const kindComparison = left.kind.localeCompare(right.kind);

  if (kindComparison !== 0) {
    return kindComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareWorkspaceResourceItems(
  left: ProjectWorkspaceResourceItem,
  right: ProjectWorkspaceResourceItem,
): number {
  const rightTime = sortTimestamp(right.updatedAt);
  const leftTime = sortTimestamp(left.updatedAt);

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  const kindComparison = left.kind.localeCompare(right.kind);

  if (kindComparison !== 0) {
    return kindComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareWorkspaceReviewItems(
  left: ProjectWorkspaceReviewItem,
  right: ProjectWorkspaceReviewItem,
): number {
  const rightTime = new Date(right.occurredAt).getTime();
  const leftTime = new Date(left.occurredAt).getTime();

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  const kindComparison = left.kind.localeCompare(right.kind);

  if (kindComparison !== 0) {
    return kindComparison;
  }

  return left.id.localeCompare(right.id);
}

function buildProjectDocActivityItem(
  document: ProjectWorkspaceDocIndexItem,
): ProjectWorkspaceActivityItem {
  const versionNumber = document.latestVersion?.versionNumber ?? 0;
  const occurredAt = document.latestVersion?.capturedAt ?? document.updatedAt;
  const summary = versionNumber > 0
    ? `Project Doc ${document.publishState} · version ${versionNumber}`
    : `Project Doc ${document.publishState} · no saved version yet`;

  return {
    href: document.openHref,
    id: `project-doc:${document.documentId}`,
    kind: 'project-doc',
    occurredAt,
    projectId: document.projectId,
    sourceId: document.documentId,
    sourceLabel: 'Project Doc',
    summary,
    title: document.title,
  };
}

function buildProjectDocResourceItem(
  document: ProjectWorkspaceDocIndexItem,
): ProjectWorkspaceResourceItem {
  const versionNumber = document.latestVersion?.versionNumber ?? 0;

  return {
    href: document.openHref,
    id: `project-doc:${document.documentId}`,
    kind: 'project-doc',
    projectId: document.projectId,
    sourceId: document.documentId,
    subtitle: versionNumber > 0
      ? `${document.publishState} · version ${versionNumber}`
      : `${document.publishState} · no saved version yet`,
    title: document.title,
    updatedAt: document.updatedAt,
  };
}

function buildProjectDocReviewItem(
  document: ProjectWorkspaceDocIndexItem,
): ProjectWorkspaceReviewItem {
  const versionNumber = document.latestVersion?.versionNumber ?? 0;

  return {
    href: document.openHref,
    id: `project-doc-review:${document.documentId}`,
    kind: 'project-doc-review',
    occurredAt: document.latestVersion?.capturedAt ?? document.updatedAt,
    priority: 'review',
    projectId: document.projectId,
    sourceId: document.documentId,
    sourceLabel: 'Project Doc',
    summary: versionNumber > 0
      ? `Project Doc is in review · version ${versionNumber}`
      : 'Project Doc is in review · no saved version yet',
    title: document.title,
  };
}

function buildProjectLibraryHref(projectId: string, entryId: string): string {
  return `/projects/${projectId}/library/${entryId}/reader`;
}

function buildProjectLibraryActivityItem(
  projectId: string,
  libraryEntry: PersistedLibraryEntryView,
): ProjectWorkspaceActivityItem {
  return {
    href: buildProjectLibraryHref(projectId, libraryEntry.entry.id),
    id: `library-entry:${libraryEntry.entry.id}`,
    kind: 'library-entry',
    occurredAt: libraryEntry.entry.updatedAt,
    projectId,
    sourceId: libraryEntry.entry.id,
    sourceLabel: 'Project Library',
    summary: `Project Library · ${libraryEntry.asset.canonicalId}`,
    title: libraryEntry.asset.title,
  };
}

function buildProjectLibraryResourceItem(
  projectId: string,
  libraryEntry: PersistedLibraryEntryView,
): ProjectWorkspaceResourceItem {
  return {
    href: buildProjectLibraryHref(projectId, libraryEntry.entry.id),
    id: `library-entry:${libraryEntry.entry.id}`,
    kind: 'library-entry',
    projectId,
    sourceId: libraryEntry.entry.id,
    subtitle: `Project Library · ${libraryEntry.asset.canonicalId}`,
    title: libraryEntry.asset.title,
    updatedAt: libraryEntry.entry.updatedAt,
  };
}

function buildProjectCommentActivityItem(
  projectId: string,
  libraryEntry: PersistedLibraryEntryView,
  comment: PersistedProjectReadingCommentRecord,
): ProjectWorkspaceActivityItem {
  return {
    href: buildProjectLibraryHref(projectId, libraryEntry.entry.id),
    id: `reader-comment:${comment.id}`,
    kind: 'reader-comment',
    occurredAt: comment.createdAt,
    projectId,
    sourceId: comment.id,
    sourceLabel: 'Reader comment',
    summary: `Project comment · ${libraryEntry.asset.title}`,
    title: truncateText(comment.body),
  };
}

function buildProjectCommentReviewItem(
  projectId: string,
  libraryEntry: PersistedLibraryEntryView,
  comment: PersistedProjectReadingCommentRecord,
): ProjectWorkspaceReviewItem {
  return {
    href: buildProjectLibraryHref(projectId, libraryEntry.entry.id),
    id: `reader-comment:${comment.id}`,
    kind: 'reader-comment',
    occurredAt: comment.createdAt,
    priority: 'context',
    projectId,
    sourceId: comment.id,
    sourceLabel: 'Reader comment',
    summary: `Recent project Reader comment · ${libraryEntry.asset.title}`,
    title: truncateText(comment.body),
  };
}

function buildProjectExcerptActivityItem(
  projectId: string,
  libraryEntry: PersistedLibraryEntryView,
  excerpt: PersistedReaderExcerptRecord,
): ProjectWorkspaceActivityItem {
  return {
    href: buildProjectLibraryHref(projectId, libraryEntry.entry.id),
    id: `reader-excerpt:${excerpt.id}`,
    kind: 'reader-excerpt',
    occurredAt: excerpt.updatedAt,
    projectId,
    sourceId: excerpt.id,
    sourceLabel: 'Reader excerpt',
    summary: `Reader excerpt · ${libraryEntry.asset.title}${excerpt.locator ? ` · ${excerpt.locator}` : ''}`,
    title: truncateText(excerpt.quote),
  };
}

function buildProjectExcerptResourceItem(
  projectId: string,
  libraryEntry: PersistedLibraryEntryView,
  excerpt: PersistedReaderExcerptRecord,
): ProjectWorkspaceResourceItem {
  return {
    href: buildProjectLibraryHref(projectId, libraryEntry.entry.id),
    id: `reader-excerpt:${excerpt.id}`,
    kind: 'reader-excerpt',
    projectId,
    sourceId: excerpt.id,
    subtitle: `Reader excerpt · ${libraryEntry.asset.title}${excerpt.locator ? ` · ${excerpt.locator}` : ''}`,
    title: truncateText(excerpt.quote),
    updatedAt: excerpt.updatedAt,
  };
}

function buildProjectExcerptReviewItem(
  projectId: string,
  libraryEntry: PersistedLibraryEntryView,
  excerpt: PersistedReaderExcerptRecord,
): ProjectWorkspaceReviewItem {
  return {
    href: buildProjectLibraryHref(projectId, libraryEntry.entry.id),
    id: `reader-excerpt:${excerpt.id}`,
    kind: 'reader-excerpt',
    occurredAt: excerpt.updatedAt,
    priority: 'context',
    projectId,
    sourceId: excerpt.id,
    sourceLabel: 'Reader excerpt',
    summary: `Recent project Reader excerpt · ${libraryEntry.asset.title}${excerpt.locator ? ` · ${excerpt.locator}` : ''}`,
    title: truncateText(excerpt.quote),
  };
}

function buildProjectJobHref(projectId: string, jobId: string): string {
  return `/jobs?scopeType=project&scopeId=${encodeURIComponent(projectId)}&jobId=${encodeURIComponent(jobId)}`;
}

function buildProjectJobActivityItem(
  projectId: string,
  job: PersistedJobRecord,
): ProjectWorkspaceActivityItem {
  return {
    href: buildProjectJobHref(projectId, job.id),
    id: `job:${job.id}`,
    kind: 'job',
    occurredAt: job.updatedAt,
    projectId,
    sourceId: job.id,
    sourceLabel: 'Project job',
    summary: `Job status · ${job.status}`,
    title: job.kind,
  };
}

function buildProjectJobResourceItem(
  projectId: string,
  job: PersistedJobRecord,
): ProjectWorkspaceResourceItem {
  return {
    href: buildProjectJobHref(projectId, job.id),
    id: `job:${job.id}`,
    kind: 'job',
    projectId,
    sourceId: job.id,
    subtitle: `Project job · ${job.status}`,
    title: job.kind,
    updatedAt: job.updatedAt,
  };
}

function isProjectJobReviewCandidate(job: PersistedJobRecord): boolean {
  return job.status === 'failed' || job.status === 'queued' || job.status === 'running';
}

function buildProjectJobReviewItem(
  projectId: string,
  job: PersistedJobRecord,
): ProjectWorkspaceReviewItem {
  const isFailed = job.status === 'failed';

  return {
    href: buildProjectJobHref(projectId, job.id),
    id: `job-attention:${job.id}`,
    kind: 'job-attention',
    occurredAt: job.updatedAt,
    priority: isFailed ? 'attention' : 'monitor',
    projectId,
    sourceId: job.id,
    sourceLabel: 'Project job',
    summary: isFailed
      ? `Failed governed project job · ${job.status}`
      : `Governed project job needs monitoring · ${job.status}`,
    title: job.kind,
  };
}

function buildProjectReviewSection(
  projectId: string,
  reviewItems: ProjectWorkspaceReviewItem[],
): ProjectWorkspaceReviewSection {
  const sortedReviewItems = [...reviewItems].sort(compareWorkspaceReviewItems);
  const newestReviewTimestamp = sortedReviewItems[0]?.occurredAt;

  return {
    emptyState: emptyProjectReviewSection,
    items: sortedReviewItems.slice(0, projectWorkspaceReviewLimit),
    projectId,
    summary: {
      collaborationSignals: sortedReviewItems.filter(
        (item) => item.kind === 'reader-comment' || item.kind === 'reader-excerpt',
      ).length,
      documentsInReview: sortedReviewItems.filter(
        (item) => item.kind === 'project-doc-review',
      ).length,
      jobsNeedingAttention: sortedReviewItems.filter(
        (item) => item.kind === 'job-attention',
      ).length,
      newestReviewTimestamp,
      totalReviewItems: sortedReviewItems.length,
    },
    totalCount: sortedReviewItems.length,
  };
}

export function createProjectWorkspaceService(
  store: ProjectWorkspaceStore,
): ProjectWorkspaceService {
  return {
    async getWorkspace(
      projectId: string,
      actorUserId: string,
    ): Promise<ProjectWorkspaceResponse> {
      const project = await store.projectRepository.getProjectForActor(
        projectId,
        actorUserId,
      );

      if (!project) {
        const existingProject = await store.projectRepository.findProject(projectId);

        if (!existingProject) {
          throw new Error(`Project ${projectId} does not exist.`);
        }

        throw new Error('Access denied for the requested project workspace.');
      }

      const documents = await store.projectDocRepository.listDocumentsForProject(projectId);
      const docIndexDocuments = documents.map(mapDocIndexItem);
      const docsCreatePermissions = resolveDocsCreatePermissions(project.membership.role);
      const projectLibraryEntries = await store.libraryRepository.listLibraryEntriesForScope({
        id: projectId,
        type: 'project',
      });
      const projectScopedSignals = await Promise.all(
        projectLibraryEntries.map(async (libraryEntry) => ({
          comments: await store.readingRepository.listProjectCommentsForEntry({
            libraryEntryId: libraryEntry.entry.id,
            projectId,
          }),
          excerpts: await store.readingRepository.listReaderExcerptsForEntry(
            libraryEntry.entry.id,
          ),
          libraryEntry,
        })),
      );
      const projectJobs = await store.jobRepository.listJobsForScope({
        scope: { id: projectId, type: 'project' },
        spaceId: project.project.spaceId,
      });

      const activityItems = [
        ...docIndexDocuments.map(buildProjectDocActivityItem),
        ...projectLibraryEntries.map((libraryEntry) =>
          buildProjectLibraryActivityItem(projectId, libraryEntry),
        ),
        ...projectScopedSignals.flatMap(({ comments, excerpts, libraryEntry }) => [
          ...comments.map((comment) =>
            buildProjectCommentActivityItem(projectId, libraryEntry, comment),
          ),
          ...excerpts.map((excerpt) =>
            buildProjectExcerptActivityItem(projectId, libraryEntry, excerpt),
          ),
        ]),
        ...projectJobs.map((job) => buildProjectJobActivityItem(projectId, job)),
      ].sort(compareWorkspaceActivityItems);
      const resourceItems = [
        ...docIndexDocuments.map(buildProjectDocResourceItem),
        ...projectLibraryEntries.map((libraryEntry) =>
          buildProjectLibraryResourceItem(projectId, libraryEntry),
        ),
        ...projectScopedSignals.flatMap(({ excerpts, libraryEntry }) =>
          excerpts.map((excerpt) =>
            buildProjectExcerptResourceItem(projectId, libraryEntry, excerpt),
          ),
        ),
        ...projectJobs.map((job) => buildProjectJobResourceItem(projectId, job)),
      ].sort(compareWorkspaceResourceItems);
      const reviewItems = [
        ...docIndexDocuments
          .filter((document) => document.publishState === 'review')
          .map(buildProjectDocReviewItem),
        ...projectJobs
          .filter(isProjectJobReviewCandidate)
          .map((job) => buildProjectJobReviewItem(projectId, job)),
        ...projectScopedSignals.flatMap(({ comments, excerpts, libraryEntry }) => [
          ...comments.map((comment) =>
            buildProjectCommentReviewItem(projectId, libraryEntry, comment),
          ),
          ...excerpts.map((excerpt) =>
            buildProjectExcerptReviewItem(projectId, libraryEntry, excerpt),
          ),
        ]),
      ];

      return {
        activity: {
          emptyState: emptyProjectActivitySection,
          items: activityItems.slice(0, projectWorkspaceActivityLimit),
          projectId,
          totalCount: activityItems.length,
        },
        actor: {
          role: project.membership.role,
          userId: actorUserId,
        },
        contract: projectsContract,
        docs: {
          ...docsCreatePermissions,
          documents: docIndexDocuments,
          emptyState: emptyProjectDocsIndex,
          projectId,
          totalCount: docIndexDocuments.length,
        },
        generatedAt: new Date().toISOString(),
        links: {
          libraryHref: `/projects/${project.project.id}/library`,
          projectHref: `/projects/${project.project.id}`,
          writerHref: docIndexDocuments[0]?.openHref,
        },
        membership: project.membership,
        project: project.project,
        review: buildProjectReviewSection(projectId, reviewItems),
        resources: {
          emptyState: emptyProjectResourcesSection,
          items: resourceItems,
          projectId,
          totalCount: resourceItems.length,
        },
      };
    },
  };
}
