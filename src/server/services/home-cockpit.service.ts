import {
  homeCockpitContract,
  type HomeCockpitActivityItem,
  type HomeCockpitActor,
  type HomeCockpitLinkAction,
  type HomeCockpitProjectReviewItem,
  type HomeCockpitProjectReviewSection,
  type HomeCockpitResponse,
  type HomeCockpitSummarySection,
} from '@shared/contracts/home-cockpit';
import type { JobRecord } from '@shared/contracts/jobs';
import type { LibraryEntryView } from '@shared/contracts/library';
import type { ProjectListItem } from '@shared/contracts/projects';

import type { CredentialsRoutes } from '../routes/credentials.routes';
import type { JobsRoutes } from '../routes/jobs.routes';
import type { LibraryRoutes } from '../routes/library.routes';
import type { NotebooksRoutes } from '../routes/notebooks.routes';
import type { ProjectDocsRoutes } from '../routes/project-docs.routes';
import type { ProjectWorkspaceRoutes } from '../routes/project-workspace.routes';
import type { ProjectsRoutes } from '../routes/projects.routes';
import type { SpacesRoutes } from '../routes/spaces.routes';

export interface HomeCockpitServiceStore {
  credentials: CredentialsRoutes;
  jobs: JobsRoutes;
  library: LibraryRoutes;
  notebooks: NotebooksRoutes;
  projectDocs: ProjectDocsRoutes;
  projectWorkspace: ProjectWorkspaceRoutes;
  projects: ProjectsRoutes;
  spaces: SpacesRoutes;
}

export interface HomeCockpitService {
  getHomeCockpit(actor: HomeCockpitActor): Promise<HomeCockpitResponse>;
}

function action(
  id: string,
  label: string,
  description: string,
  to: string,
  priority: HomeCockpitLinkAction['priority'] = 'secondary',
): HomeCockpitLinkAction {
  return {
    description,
    id,
    label,
    priority,
    to,
  };
}

function latestTimestamp(...values: Array<string | undefined>): string | undefined {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value));
  const validTimestamps = timestamps.filter(
    (timestamp) => !Number.isNaN(timestamp.getTime()),
  );

  if (validTimestamps.length === 0) {
    return undefined;
  }

  return new Date(
    Math.max(...validTimestamps.map((timestamp) => timestamp.getTime())),
  ).toISOString();
}

function compareActivity(
  left: HomeCockpitActivityItem,
  right: HomeCockpitActivityItem,
): number {
  const rightTime = new Date(right.occurredAt).getTime();
  const leftTime = new Date(left.occurredAt).getTime();

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return left.id.localeCompare(right.id);
}

const homeProjectReviewLimit = 6;

const emptyHomeProjectReviewSection = {
  body: 'Project review and attention items will appear here when visible projects have Project Docs in review, governed jobs needing monitoring, or project Reader collaboration signals.',
  title: 'No project review items yet',
};

function compareProjectReviewItems(
  left: HomeCockpitProjectReviewItem,
  right: HomeCockpitProjectReviewItem,
): number {
  const rightTime = new Date(right.occurredAt).getTime();
  const leftTime = new Date(left.occurredAt).getTime();

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  const projectComparison = left.projectName.localeCompare(right.projectName);

  if (projectComparison !== 0) {
    return projectComparison;
  }

  return left.id.localeCompare(right.id);
}

function buildProjectReviewSection(input: {
  projects: ProjectListItem[];
  workspaces: Awaited<ReturnType<ProjectWorkspaceRoutes['getWorkspace']>>[];
}): HomeCockpitProjectReviewSection {
  const projectNames = new Map(
    input.projects.map((project) => [project.project.id, project.project.name]),
  );
  const reviewItems = input.workspaces.flatMap((workspace) =>
    workspace.review.items.map((item): HomeCockpitProjectReviewItem => ({
      href: item.href,
      id: `project-review:${workspace.project.id}:${item.id}`,
      kind: item.kind,
      occurredAt: item.occurredAt,
      priority: item.priority,
      projectId: workspace.project.id,
      projectName: projectNames.get(workspace.project.id) ?? workspace.project.name,
      sourceId: item.sourceId,
      sourceLabel: item.sourceLabel,
      summary: item.summary,
      title: item.title,
    })),
  ).sort(compareProjectReviewItems);
  const newestReviewTimestamp = latestTimestamp(
    ...input.workspaces.map((workspace) => workspace.review.summary.newestReviewTimestamp),
  );
  const totalReviewItems = input.workspaces.reduce(
    (total, workspace) => total + workspace.review.summary.totalReviewItems,
    0,
  );

  return {
    emptyState: emptyHomeProjectReviewSection,
    items: reviewItems.slice(0, homeProjectReviewLimit),
    summary: {
      collaborationSignals: input.workspaces.reduce(
        (total, workspace) => total + workspace.review.summary.collaborationSignals,
        0,
      ),
      documentsInReview: input.workspaces.reduce(
        (total, workspace) => total + workspace.review.summary.documentsInReview,
        0,
      ),
      jobsNeedingAttention: input.workspaces.reduce(
        (total, workspace) => total + workspace.review.summary.jobsNeedingAttention,
        0,
      ),
      newestReviewTimestamp,
      projectsWithReviewItems: input.workspaces.filter(
        (workspace) => workspace.review.summary.totalReviewItems > 0,
      ).length,
      totalReviewItems,
      visibleProjects: input.projects.length,
    },
    totalCount: totalReviewItems,
  };
}

function buildCollaborationSection(input: {
  projects: ProjectListItem[];
  spaces: Awaited<ReturnType<SpacesRoutes['listSpaces']>>;
}): HomeCockpitSummarySection {
  const { projects, spaces } = input;
  const activeProjects = projects.filter((item) => item.project.status === 'active');
  const sharedSpaces = spaces.filter((space) => space.kind === 'shared');

  return {
    description: projects.length > 0
      ? 'Server-visible spaces and project memberships define collaboration access.'
      : 'Create or join a governed space and project before sharing research assets.',
    id: 'collaboration',
    metrics: [
      {
        detail: 'Projects returned by the server for this session actor.',
        label: 'Visible projects',
        value: projects.length,
      },
      {
        label: 'Active projects',
        value: activeProjects.length,
      },
      {
        label: 'Shared spaces',
        value: sharedSpaces.length,
      },
    ],
    primaryAction: action(
      projects.length > 0 ? 'open-projects' : 'create-project',
      projects.length > 0 ? 'Open Projects' : 'Create project',
      projects.length > 0
        ? 'Review visible projects.'
        : 'Start a collaboration lane from a governed space.',
      '/projects',
      'primary',
    ),
    status: projects.length > 0 ? 'active' : 'empty',
    title: 'Collaboration cockpit',
  };
}

function buildLibrarySection(input: {
  libraryEntries: LibraryEntryView[];
}): HomeCockpitSummarySection {
  const { libraryEntries } = input;

  return {
    description: libraryEntries.length > 0
      ? 'Personal Library entries are ready for reading and project adoption.'
      : 'Import literature into your Personal Library before reading or adopting into a project.',
    id: 'library',
    metrics: [
      {
        detail: 'Personal-scope entries visible to this actor.',
        label: 'Personal sources',
        value: libraryEntries.length,
      },
      {
        label: 'Readable assets',
        value: libraryEntries.length,
      },
    ],
    primaryAction: action(
      libraryEntries.length > 0 ? 'open-library' : 'search-literature',
      libraryEntries.length > 0 ? 'Open Library' : 'Search literature',
      libraryEntries.length > 0
        ? 'Continue from server-owned personal sources.'
        : 'Find PubMed or arXiv sources to import.',
      libraryEntries.length > 0 ? '/library' : '/search',
      'primary',
    ),
    status: libraryEntries.length > 0 ? 'active' : 'empty',
    title: 'Literature and reading',
  };
}

function buildWritingSection(input: {
  notebooksCount: number;
  visibleWriterDrafts: number;
}): HomeCockpitSummarySection {
  const { notebooksCount, visibleWriterDrafts } = input;
  const hasWritingContext = notebooksCount > 0 || visibleWriterDrafts > 0;

  return {
    description: hasWritingContext
      ? 'Private notebooks and Project Doc drafts are available through server document contracts.'
      : 'Capture evidence into a Notebook or save selected project reading evidence to Project Docs when ready.',
    id: 'writing',
    metrics: [
      {
        label: 'Private notebooks',
        value: notebooksCount,
      },
      {
        detail: 'Latest visible Project Doc drafts found through project memberships.',
        label: 'Project Doc drafts',
        value: visibleWriterDrafts,
      },
    ],
    primaryAction: action(
      notebooksCount > 0 ? 'open-notebook' : 'start-notebook',
      notebooksCount > 0 ? 'Open Notebook' : 'Start Notebook',
      notebooksCount > 0
        ? 'Return to private synthesis.'
        : 'Create a private synthesis notebook.',
      '/notebook',
      'primary',
    ),
    status: hasWritingContext ? 'active' : 'empty',
    title: 'Notebook and Project Docs',
  };
}

function buildJobsSection(input: {
  apiKeyConfigured: boolean;
  jobs: JobRecord[];
}): HomeCockpitSummarySection {
  const { apiKeyConfigured, jobs } = input;
  const activeJobs = jobs.filter(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const failedJobs = jobs.filter((job) => job.status === 'failed');

  return {
    description: apiKeyConfigured
      ? 'Governed job status is listed from actor-authorized job scopes.'
      : 'Configure provider credentials before running governed AI jobs.',
    id: 'jobs',
    metrics: [
      {
        label: 'Personal jobs',
        value: jobs.length,
      },
      {
        label: 'Queued or running',
        value: activeJobs.length,
      },
      {
        label: 'Needs attention',
        value: failedJobs.length,
      },
    ],
    primaryAction: action(
      apiKeyConfigured ? 'open-jobs' : 'configure-credentials',
      apiKeyConfigured ? 'Open Jobs' : 'Configure credentials',
      apiKeyConfigured
        ? 'Review governed runtime activity.'
        : 'Set up a credential reference before launching jobs.',
      apiKeyConfigured ? '/jobs' : '/settings',
      'primary',
    ),
    status: failedJobs.length > 0
      ? 'attention'
      : apiKeyConfigured || jobs.length > 0
        ? 'active'
        : 'empty',
    title: 'Governed jobs',
  };
}

function buildActivity(input: {
  generatedAt: string;
  jobs: JobRecord[];
  libraryEntries: LibraryEntryView[];
  notebooks: Awaited<ReturnType<NotebooksRoutes['listDocuments']>>['documents'];
  projects: ProjectListItem[];
  writerDrafts: Array<{ documentId: string; projectId: string; title: string; updatedAt: string }>;
}): HomeCockpitActivityItem[] {
  const items: HomeCockpitActivityItem[] = [];

  for (const project of input.projects) {
    items.push({
      context: `${project.membership.role} · ${project.project.spaceId}`,
      href: `/projects/${project.project.id}`,
      id: `project:${project.project.id}`,
      kind: 'project',
      occurredAt: latestTimestamp(project.project.updatedAt, project.membership.joinedAt) ?? input.generatedAt,
      title: project.project.name,
    });
  }

  for (const entry of input.libraryEntries) {
    items.push({
      context: entry.asset.canonicalId,
      href: `/library/${entry.entry.id}/reader`,
      id: `library:${entry.entry.id}`,
      kind: 'library',
      occurredAt: latestTimestamp(entry.entry.createdAt, entry.entry.addedAt) ?? input.generatedAt,
      title: entry.asset.title,
    });
  }

  for (const notebook of input.notebooks) {
    items.push({
      context: 'Private Notebook',
      href: '/notebook',
      id: `notebook:${notebook.id}`,
      kind: 'notebook',
      occurredAt: latestTimestamp(notebook.updatedAt, notebook.createdAt) ?? input.generatedAt,
      title: notebook.title,
    });
  }

  for (const draft of input.writerDrafts) {
    items.push({
      context: `Project Docs · ${draft.projectId}`,
      href: `/projects/${draft.projectId}/writing/${draft.documentId}`,
      id: `writing:${draft.documentId}`,
      kind: 'writing',
      occurredAt: latestTimestamp(draft.updatedAt) ?? input.generatedAt,
      title: draft.title,
    });
  }

  for (const job of input.jobs) {
    items.push({
      context: `${job.kind} · ${job.status}`,
      href: '/jobs',
      id: `job:${job.id}`,
      kind: 'job',
      occurredAt: latestTimestamp(job.createdAt) ?? input.generatedAt,
      title: job.id,
    });
  }

  return items.sort(compareActivity).slice(0, 6);
}

function buildNextActions(input: {
  apiKeyConfigured: boolean;
  libraryCount: number;
  projectCount: number;
}): HomeCockpitLinkAction[] {
  const actions: HomeCockpitLinkAction[] = [];

  if (input.projectCount === 0) {
    actions.push(action(
      'next-create-project',
      'Create your first project',
      'Projects are the collaboration unit for shared reading and writing.',
      '/projects',
      'primary',
    ));
  }

  if (input.libraryCount === 0) {
    actions.push(action(
      'next-import-source',
      'Import a source',
      'Search external literature and import a server-owned library entry.',
      '/search',
      input.projectCount === 0 ? 'secondary' : 'primary',
    ));
  }

  if (!input.apiKeyConfigured) {
    actions.push(action(
      'next-configure-credentials',
      'Configure governed AI',
      'Store a provider credential reference before launching jobs.',
      '/settings',
      'secondary',
    ));
  }

  actions.push(action(
    'next-open-today',
    'Review today\'s recommendations',
    'Use the discovery feed to decide the next source to read.',
    '/today',
    actions.length === 0 ? 'primary' : 'secondary',
  ));

  return actions.slice(0, 4);
}

export function createHomeCockpitService(
  store: HomeCockpitServiceStore,
): HomeCockpitService {
  return {
    async getHomeCockpit(actor: HomeCockpitActor): Promise<HomeCockpitResponse> {
      const actorUserId = actor.id;

      if (!actorUserId) {
        throw new Error('Home cockpit requires a server-derived actor user id.');
      }

      const generatedAt = new Date().toISOString();
      const [spaces, projects, libraryEntries, notebooks, settings, jobs] = await Promise.all([
        store.spaces.listSpaces({ actorUserId }),
        store.projects.listProjects(actorUserId),
        store.library.listPersonalEntries(actorUserId),
        store.notebooks.listDocuments(actorUserId),
        store.credentials.getWorkbenchSettings(actorUserId),
        store.jobs.listJobs({
          actorUserId,
          scope: { id: actorUserId, type: 'user' },
        }),
      ]);

      const writerDrafts = (
        await Promise.all(
          projects.map(async (item) => {
            const document = await store.projectDocs.findLatestProjectDocument(
              item.project.id,
              actorUserId,
            );

            return document
              ? {
                  documentId: document.id,
                  projectId: document.projectId,
                  title: document.title,
                  updatedAt: document.updatedAt,
                }
              : null;
          }),
        )
      ).filter(
        (document): document is { documentId: string; projectId: string; title: string; updatedAt: string } =>
          Boolean(document),
      );
      const projectWorkspaces = await Promise.all(
        projects.map((project) =>
          store.projectWorkspace.getWorkspace(project.project.id, actorUserId),
        ),
      );
      const projectReview = buildProjectReviewSection({
        projects,
        workspaces: projectWorkspaces,
      });

      const sections = [
        buildCollaborationSection({ projects, spaces }),
        buildLibrarySection({ libraryEntries }),
        buildWritingSection({
          notebooksCount: notebooks.documents.length,
          visibleWriterDrafts: writerDrafts.length,
        }),
        buildJobsSection({
          apiKeyConfigured: settings.apiKeyConfigured,
          jobs,
        }),
      ];

      return {
        actor,
        contract: homeCockpitContract,
        generatedAt,
        nextActions: buildNextActions({
          apiKeyConfigured: settings.apiKeyConfigured,
          libraryCount: libraryEntries.length,
          projectCount: projects.length,
        }),
        notices: [
          {
            body: 'Home cockpit data is built on the server from session-derived actor access and shared transport contracts.',
            id: 'server-owned-read-model',
            title: 'Server-owned cockpit',
            tone: 'info',
          },
          ...(settings.apiKeyConfigured
            ? []
            : [{
                body: 'Provider keys are stored only through credential references; the cockpit never returns raw secrets.',
                id: 'credentials-not-configured',
                title: 'Governed AI not configured',
                tone: 'warning' as const,
              }]),
        ],
        projectReview,
        recentActivity: buildActivity({
          generatedAt,
          jobs,
          libraryEntries,
          notebooks: notebooks.documents,
          projects,
          writerDrafts,
        }),
        sections,
        workbench: {
          label: 'Personal workbench',
          route: '/home',
          scope: { id: actorUserId, type: 'user' },
        },
      };
    },
  };
}
