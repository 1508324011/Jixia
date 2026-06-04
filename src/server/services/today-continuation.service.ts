import {
  todayContinuationContract,
  type TodayContinuationAction,
  type TodayContinuationItem,
  type TodayContinuationPriority,
  type TodayContinuationResponse,
  type TodayContinuationSection,
  type TodayContinuationSectionKind,
} from '@shared/contracts/today-continuation';
import type { JobRecord } from '@shared/contracts/jobs';
import type { LibraryEntryView } from '@shared/contracts/library';
import type {
  ProjectListItem,
  ProjectWorkspaceReviewItem,
  ProjectWorkspaceResponse,
} from '@shared/contracts/projects';

import type { JobsRoutes } from '../routes/jobs.routes';
import type { LibraryRoutes } from '../routes/library.routes';
import type { NotebooksRoutes } from '../routes/notebooks.routes';
import type { ProjectWorkspaceRoutes } from '../routes/project-workspace.routes';
import type { ProjectsRoutes } from '../routes/projects.routes';
import type { ReadingRoutes } from '../routes/reading.routes';

export interface TodayContinuationActor {
  userId: string;
}

export interface TodayContinuationServiceStore {
  jobs: JobsRoutes;
  library: LibraryRoutes;
  notebooks: NotebooksRoutes;
  projectWorkspace: ProjectWorkspaceRoutes;
  projects: ProjectsRoutes;
  reading: ReadingRoutes;
}

export interface TodayContinuationService {
  getTodayContinuation(
    actor: TodayContinuationActor,
  ): Promise<TodayContinuationResponse>;
}

const sectionItemLimit = 5;
const nextActionLimit = 4;

const emptyTodayContinuationState = {
  body: 'No personal reading, imports, Notebook drafts, visible project review items, or governed AI jobs need action right now. Use discovery to import a source when you are ready to start a new continuation thread.',
  href: '/search',
  title: 'No continuation items for today',
};

const sectionEmptyStates: Record<TodayContinuationSectionKind, { body: string; href: string; title: string }> = {
  ai_jobs: {
    body: 'Governed jobs that are failed, queued, or running will appear here with links to the Jobs or AI Workspace surfaces.',
    href: '/ai-workspace',
    title: 'No AI jobs need action',
  },
  in_progress_reading: {
    body: 'Personal Library entries with meaningful saved reading progress will appear here.',
    href: '/library',
    title: 'No in-progress readings',
  },
  new_imports: {
    body: 'Recently imported personal Library entries without meaningful reading progress will appear here as continuation hints.',
    href: '/library',
    title: 'No unread personal imports',
  },
  notebook_drafts: {
    body: 'Private Notebook documents owned by this actor will appear here as conservative synthesis continuation hints.',
    href: '/notebook',
    title: 'No private Notebook drafts',
  },
  project_review: {
    body: 'Review items from projects visible through persisted project membership will appear here.',
    href: '/projects',
    title: 'No visible project review items',
  },
};

const sectionTitles: Record<TodayContinuationSectionKind, { description: string; title: string }> = {
  ai_jobs: {
    description: 'Server-classified governed job statuses for personal and visible project scopes.',
    title: 'Governed AI jobs needing action',
  },
  in_progress_reading: {
    description: 'Personal Library entries where this actor has meaningful incomplete reading progress.',
    title: 'Continue reading',
  },
  new_imports: {
    description: 'Personal Library entries that are imported but have no meaningful reading progress yet.',
    title: 'New imports to triage',
  },
  notebook_drafts: {
    description: 'Owner-scoped private Notebook documents that can be resumed without exposing note bodies.',
    title: 'Private Notebook drafts',
  },
  project_review: {
    description: 'Project workspace review and attention items from projects visible to this actor.',
    title: 'Visible project review',
  },
};

function latestTimestamp(...values: Array<string | undefined>): string | undefined {
  const validTimestamps = values
    .map((value) => value ? new Date(value).getTime() : Number.NaN)
    .filter((timestamp) => !Number.isNaN(timestamp));

  if (validTimestamps.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...validTimestamps)).toISOString();
}

function timestampSortValue(item: Pick<TodayContinuationItem, 'timestamp'>): number {
  return item.timestamp ? new Date(item.timestamp).getTime() : 0;
}

function prioritySortValue(priority: TodayContinuationPriority): number {
  if (priority === 'high') {
    return 3;
  }

  if (priority === 'medium') {
    return 2;
  }

  return 1;
}

function compareContinuationItems(
  left: TodayContinuationItem,
  right: TodayContinuationItem,
): number {
  const priorityDifference = prioritySortValue(right.priority) - prioritySortValue(left.priority);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const timestampDifference = timestampSortValue(right) - timestampSortValue(left);

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return left.id.localeCompare(right.id);
}

function section(
  kind: TodayContinuationSectionKind,
  items: TodayContinuationItem[],
  totalCount = items.length,
): TodayContinuationSection {
  return {
    description: sectionTitles[kind].description,
    emptyState: sectionEmptyStates[kind],
    items: [...items].sort(compareContinuationItems).slice(0, sectionItemLimit),
    kind,
    title: sectionTitles[kind].title,
    totalCount,
  };
}

function buildPersonalReaderHref(entryId: string): string {
  return `/library/${encodeURIComponent(entryId)}/reader`;
}

function buildPersonalJobHref(jobId: string): string {
  return `/jobs?jobId=${encodeURIComponent(jobId)}`;
}

function buildProjectJobHref(projectId: string, jobId: string): string {
  return `/jobs?scopeType=project&scopeId=${encodeURIComponent(projectId)}&jobId=${encodeURIComponent(jobId)}`;
}

function isInProgressReading(progressPercent: number | undefined): boolean {
  return typeof progressPercent === 'number' && progressPercent > 0 && progressPercent < 100;
}

function isUnreadImport(progressPercent: number | undefined): boolean {
  return typeof progressPercent !== 'number' || progressPercent <= 0;
}

function readingPriority(progressPercent: number): TodayContinuationPriority {
  return progressPercent >= 50 ? 'high' : 'medium';
}

function mapInProgressReading(
  entry: LibraryEntryView,
  progressPercent: number,
  lastReadAt?: string,
): TodayContinuationItem {
  return {
    href: buildPersonalReaderHref(entry.entry.id),
    id: `reader:${entry.entry.id}`,
    kind: 'in_progress_reading',
    priority: readingPriority(progressPercent),
    sourceLabel: entry.asset.canonicalId,
    summary: `Reading progress ${progressPercent}% · continue from the personal Reader.`,
    timestamp: latestTimestamp(lastReadAt, entry.entry.createdAt, entry.entry.addedAt),
    title: entry.asset.title,
  };
}

function mapNewImport(entry: LibraryEntryView): TodayContinuationItem {
  return {
    href: buildPersonalReaderHref(entry.entry.id),
    id: `import:${entry.entry.id}`,
    kind: 'new_imports',
    priority: 'medium',
    sourceLabel: entry.asset.canonicalId,
    summary: 'Imported into Personal Library with no meaningful reading progress yet.',
    timestamp: latestTimestamp(entry.entry.createdAt, entry.entry.addedAt),
    title: entry.asset.title,
  };
}

function mapNotebookDraft(
  document: Awaited<ReturnType<NotebooksRoutes['listDocuments']>>['documents'][number],
): TodayContinuationItem {
  return {
    href: `/notebook/${encodeURIComponent(document.id)}`,
    id: `notebook:${document.id}`,
    kind: 'notebook_drafts',
    priority: 'low',
    sourceLabel: 'Private Notebook',
    summary: 'Owner-scoped private Notebook metadata only; open to continue synthesis.',
    timestamp: latestTimestamp(document.updatedAt, document.createdAt),
    title: document.title,
  };
}

function reviewPriority(
  priority: ProjectWorkspaceReviewItem['priority'],
): TodayContinuationPriority {
  if (priority === 'attention' || priority === 'review') {
    return 'high';
  }

  if (priority === 'monitor') {
    return 'medium';
  }

  return 'low';
}

function mapProjectReviewItem(input: {
  item: ProjectWorkspaceReviewItem;
  project: ProjectListItem;
}): TodayContinuationItem {
  const { item, project } = input;

  return {
    href: item.href ?? `/projects/${encodeURIComponent(project.project.id)}`,
    id: `project-review:${project.project.id}:${item.id}`,
    kind: 'project_review',
    priority: reviewPriority(item.priority),
    sourceLabel: `${project.project.name} · ${item.sourceLabel}`,
    summary: item.summary,
    timestamp: item.occurredAt,
    title: item.title,
  };
}

function isJobNeedingAction(job: Pick<JobRecord, 'status'>): boolean {
  return job.status === 'failed' || job.status === 'queued' || job.status === 'running';
}

function jobPriority(job: Pick<JobRecord, 'status'>): TodayContinuationPriority {
  return job.status === 'failed' ? 'high' : 'medium';
}

function mapPersonalJob(job: JobRecord): TodayContinuationItem {
  return {
    href: buildPersonalJobHref(job.id),
    id: `ai-job:${job.id}`,
    kind: 'ai_jobs',
    priority: jobPriority(job),
    sourceLabel: 'Personal AI job',
    summary: `Governed personal job status · ${job.status}`,
    timestamp: job.createdAt,
    title: job.kind,
  };
}

function mapProjectJob(input: {
  job: JobRecord;
  project: ProjectListItem;
}): TodayContinuationItem {
  const { job, project } = input;

  return {
    href: buildProjectJobHref(project.project.id, job.id),
    id: `ai-job:${project.project.id}:${job.id}`,
    kind: 'ai_jobs',
    priority: jobPriority(job),
    sourceLabel: `${project.project.name} · Project job`,
    summary: `Governed project job status · ${job.status}`,
    timestamp: job.createdAt,
    title: job.kind,
  };
}

function actionSource(kind: TodayContinuationSectionKind): TodayContinuationAction['source'] {
  if (kind === 'in_progress_reading') {
    return 'reader';
  }

  if (kind === 'new_imports') {
    return 'library';
  }

  if (kind === 'notebook_drafts') {
    return 'notebook';
  }

  if (kind === 'project_review') {
    return 'project';
  }

  return 'ai_job';
}

function actionLabel(kind: TodayContinuationSectionKind): string {
  if (kind === 'in_progress_reading') {
    return 'Continue reading';
  }

  if (kind === 'new_imports') {
    return 'Triage import';
  }

  if (kind === 'notebook_drafts') {
    return 'Resume Notebook';
  }

  if (kind === 'project_review') {
    return 'Review project item';
  }

  return 'Check AI job';
}

function buildNextActions(items: TodayContinuationItem[]): TodayContinuationAction[] {
  return [...items]
    .sort(compareContinuationItems)
    .slice(0, nextActionLimit)
    .map((item): TodayContinuationAction => ({
      description: item.summary,
      href: item.href,
      id: `action:${item.id}`,
      label: actionLabel(item.kind),
      priority: item.priority,
      reason: `${item.sourceLabel ? `${item.sourceLabel} · ` : ''}${item.title}`,
      source: actionSource(item.kind),
    }));
}

async function loadProjectWorkspaces(input: {
  actorUserId: string;
  projects: ProjectListItem[];
  store: TodayContinuationServiceStore;
}): Promise<Array<{ project: ProjectListItem; workspace: ProjectWorkspaceResponse }>> {
  const workspaces = await Promise.all(
    input.projects.map(async (project) => ({
      project,
      workspace: await input.store.projectWorkspace.getWorkspace(
        project.project.id,
        input.actorUserId,
      ),
    })),
  );

  return workspaces;
}

async function loadProjectJobs(input: {
  actorUserId: string;
  projects: ProjectListItem[];
  store: TodayContinuationServiceStore;
}): Promise<Array<{ jobs: JobRecord[]; project: ProjectListItem }>> {
  return Promise.all(
    input.projects.map(async (project) => ({
      jobs: await input.store.jobs.listJobs({
        actorUserId: input.actorUserId,
        scope: { id: project.project.id, type: 'project' },
        spaceId: project.project.spaceId,
      }),
      project,
    })),
  );
}

export function createTodayContinuationService(
  store: TodayContinuationServiceStore,
): TodayContinuationService {
  return {
    async getTodayContinuation(
      actor: TodayContinuationActor,
    ): Promise<TodayContinuationResponse> {
      const actorUserId = actor.userId;

      if (!actorUserId) {
        throw new Error('Today continuation requires a server-derived actor user id.');
      }

      const generatedAt = new Date().toISOString();
      const [libraryEntries, notebooks, projects, personalJobs] = await Promise.all([
        store.library.listPersonalEntries(actorUserId),
        store.notebooks.listDocuments(actorUserId),
        store.projects.listProjects(actorUserId),
        store.jobs.listJobs({
          actorUserId,
          scope: { id: actorUserId, type: 'user' },
        }),
      ]);
      const readingStates = await Promise.all(
        libraryEntries.map(async (entry) => ({
          entry,
          state: await store.reading.getReadingState({
            actorUserId,
            libraryEntryId: entry.entry.id,
          }),
        })),
      );
      const [projectWorkspaces, projectJobs] = await Promise.all([
        loadProjectWorkspaces({
          actorUserId,
          projects,
          store,
        }),
        loadProjectJobs({
          actorUserId,
          projects,
          store,
        }),
      ]);

      const readingItems = readingStates
        .filter(({ state }) => isInProgressReading(state?.progressPercent))
        .map(({ entry, state }) =>
          mapInProgressReading(
            entry,
            state?.progressPercent ?? 0,
            state?.lastReadAt,
          )
        );
      const newImportItems = readingStates
        .filter(({ state }) => isUnreadImport(state?.progressPercent))
        .map(({ entry }) => mapNewImport(entry));
      const notebookItems = notebooks.documents.map(mapNotebookDraft);
      const projectReviewItems = projectWorkspaces.flatMap(({ project, workspace }) =>
        workspace.review.items.map((item) =>
          mapProjectReviewItem({ item, project })
        )
      );
      const projectReviewTotalCount = projectWorkspaces.reduce(
        (total, { workspace }) => total + workspace.review.summary.totalReviewItems,
        0,
      );
      const projectAiJobItems = projectJobs.flatMap(({ jobs, project }) =>
        jobs
          .filter(isJobNeedingAction)
          .map((job) => mapProjectJob({ job, project }))
      );
      const personalAiJobItems = personalJobs
        .filter(isJobNeedingAction)
        .map(mapPersonalJob);
      const aiJobItems = [...personalAiJobItems, ...projectAiJobItems];
      const allItems = [
        ...readingItems,
        ...newImportItems,
        ...notebookItems,
        ...projectReviewItems,
        ...aiJobItems,
      ];

      return {
        contract: todayContinuationContract,
        emptyState: emptyTodayContinuationState,
        generatedAt,
        nextActions: buildNextActions(allItems),
        sections: [
          section('in_progress_reading', readingItems),
          section('new_imports', newImportItems),
          section('notebook_drafts', notebookItems),
          section('project_review', projectReviewItems, projectReviewTotalCount),
          section('ai_jobs', aiJobItems),
        ],
        summary: {
          aiJobsNeedingAction: aiJobItems.length,
          inProgressReadings: readingItems.length,
          notebookDrafts: notebookItems.length,
          projectReviewItems: projectReviewTotalCount,
          unreadImports: newImportItems.length,
        },
      };
    },
  };
}
