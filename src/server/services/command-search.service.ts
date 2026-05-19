import {
  commandSearchContract,
  type CommandSearchResponse,
  type CommandSearchResult,
} from '@shared/contracts/command-search';
import type { JobRecord } from '@shared/contracts/jobs';
import type { LibraryEntryView } from '@shared/contracts/library';
import type { ListNotebookDocumentsResponse } from '@shared/contracts/notebook';
import type { ProjectListItem } from '@shared/contracts/projects';

import type { ProjectDocRepository } from '../../db';

import type { JobsRoutes } from '../routes/jobs.routes';
import type { LibraryRoutes } from '../routes/library.routes';
import type { NotebooksRoutes } from '../routes/notebooks.routes';
import type { ProjectsRoutes } from '../routes/projects.routes';

export interface CommandSearchQuery {
  actorUserId: string;
  projectId?: string;
  query: string;
}

export interface CommandSearchService {
  search(input: CommandSearchQuery): Promise<CommandSearchResponse>;
}

export interface CommandSearchStore {
  jobs: JobsRoutes;
  library: LibraryRoutes;
  notebooks: NotebooksRoutes;
  projectDocRepository: ProjectDocRepository;
  projects: ProjectsRoutes;
}

const MAX_RESULTS = 40;

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

function resultSearchableParts(result: CommandSearchResult): string[] {
  const searchableParts = [
    result.title,
    result.subtitle,
    result.kind,
    ...Object.values(result.metadata ?? {}).map((value) => String(value ?? '')),
  ].filter((part): part is string => typeof part === 'string');

  return searchableParts;
}

function includesQuery(result: CommandSearchResult, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return resultSearchableParts(result).some((part) =>
    part.toLowerCase().includes(normalizedQuery),
  );
}

function queryRank(result: CommandSearchResult, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 3;
  }

  const title = result.title.toLowerCase();

  if (title.startsWith(normalizedQuery)) {
    return 0;
  }

  if (title.includes(normalizedQuery)) {
    return 1;
  }

  return 2;
}

function latestTimestamp(
  ...values: Array<string | undefined>
): string | undefined {
  const times = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));

  if (times.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...times)).toISOString();
}

function compareResults(
  left: CommandSearchResult,
  right: CommandSearchResult,
  normalizedQuery: string,
): number {
  const leftRank = queryRank(left, normalizedQuery);
  const rightRank = queryRank(right, normalizedQuery);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
  const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function projectResult(item: ProjectListItem): CommandSearchResult {
  const { membership, project } = item;

  return {
    id: `project:${project.id}`,
    kind: 'project',
    metadata: {
      role: membership.role,
      status: project.status,
    },
    route: `/projects/${project.id}`,
    scope: {
      id: project.id,
      projectId: project.id,
      type: 'project',
    },
    subtitle: `${membership.role} · ${project.status}`,
    title: project.name,
    updatedAt: latestTimestamp(project.updatedAt, membership.joinedAt),
  };
}

function projectDocResult(
  document: Awaited<ReturnType<ProjectDocRepository['listDocumentsForProject']>>[number],
): CommandSearchResult {
  const latestVersion = document.latestVersion;

  return {
    id: `project-doc:${document.document.id}`,
    kind: 'project-doc',
    metadata: {
      publishState: document.document.publishState,
      versionNumber: latestVersion?.versionNumber ?? 0,
    },
    route: `/projects/${document.document.projectId}/writing/${document.document.id}`,
    scope: {
      id: document.document.projectId,
      projectId: document.document.projectId,
      type: 'project',
    },
    subtitle: `Project Doc · ${document.document.publishState}`,
    title: document.document.title,
    updatedAt: latestTimestamp(
      document.document.updatedAt,
      latestVersion?.capturedAt,
      document.document.createdAt,
    ),
  };
}

function libraryResult(entry: LibraryEntryView): CommandSearchResult {
  const scope = entry.entry.scope;
  const isProjectScope = scope.type === 'project';

  return {
    id: `library-entry:${entry.entry.id}`,
    kind: 'library-entry',
    metadata: {
      canonicalId: entry.asset.canonicalId,
      source: entry.asset.canonicalId.split(':', 1)[0] || null,
    },
    route: isProjectScope
      ? `/projects/${scope.id}/library/${entry.entry.id}/reader`
      : `/library/${entry.entry.id}/reader`,
    scope: {
      id: scope.id,
      projectId: isProjectScope ? scope.id : undefined,
      type: scope.type,
    },
    subtitle: isProjectScope
      ? `Project Library · ${entry.asset.canonicalId}`
      : `Personal Library · ${entry.asset.canonicalId}`,
    title: entry.asset.title,
    updatedAt: latestTimestamp(entry.entry.createdAt),
  };
}

function notebookResult(
  document: ListNotebookDocumentsResponse['documents'][number],
): CommandSearchResult {
  return {
    id: `notebook:${document.id}`,
    kind: 'notebook',
    route: '/notebook',
    scope: {
      id: document.ownerId,
      type: 'user',
    },
    subtitle: 'Private Notebook',
    title: document.title,
    updatedAt: latestTimestamp(document.updatedAt, document.createdAt),
  };
}

function jobResult(job: JobRecord): CommandSearchResult {
  const isProjectScope = job.scope.type === 'project';

  return {
    id: `job:${job.id}`,
    kind: 'job',
    metadata: {
      kind: job.kind,
      status: job.status,
    },
    route: '/jobs',
    scope: {
      id: job.scope.id,
      projectId: isProjectScope ? job.scope.id : undefined,
      type: job.scope.type,
    },
    subtitle: `${job.kind} · ${job.status}`,
    title: job.id,
    updatedAt: job.createdAt,
  };
}

async function collectProjectScopedResults(
  store: CommandSearchStore,
  project: ProjectListItem,
  actorUserId: string,
): Promise<CommandSearchResult[]> {
  const projectId = project.project.id;
  const [documents, libraryEntries, jobs] = await Promise.all([
    store.projectDocRepository.listDocumentsForProject(projectId),
    store.library.listEntries({
      actorSpaceId: project.project.spaceId,
      actorUserId,
      scope: { id: projectId, type: 'project' },
      spaceId: project.project.spaceId,
    }),
    store.jobs.listJobs({
      actorUserId,
      scope: { id: projectId, type: 'project' },
    }),
  ]);

  return [
    projectResult(project),
    ...documents.map(projectDocResult),
    ...libraryEntries.map(libraryResult),
    ...jobs.map(jobResult),
  ];
}

export function createCommandSearchService(
  store: CommandSearchStore,
): CommandSearchService {
  return {
    async search(input: CommandSearchQuery): Promise<CommandSearchResponse> {
      const generatedAt = new Date().toISOString();
      const normalizedQuery = normalizeQuery(input.query);
      const visibleProjects = await store.projects.listProjects(input.actorUserId);
      const scopedProjects = input.projectId
        ? visibleProjects.filter((item) => item.project.id === input.projectId)
        : visibleProjects;

      if (input.projectId && scopedProjects.length === 0) {
        await store.projects.getProject(
          { projectId: input.projectId },
          input.actorUserId,
        );
      }

      const projectScopedResults = (
        await Promise.all(
          scopedProjects.map((project) =>
            collectProjectScopedResults(store, project, input.actorUserId),
          ),
        )
      ).flat();
      const personalResults = input.projectId
        ? []
        : [
            ...(await store.library.listPersonalEntries(input.actorUserId)).map(
              libraryResult,
            ),
            ...(await store.notebooks.listDocuments(input.actorUserId)).documents.map(
              notebookResult,
            ),
            ...(await store.jobs.listJobs({
              actorUserId: input.actorUserId,
              scope: { id: input.actorUserId, type: 'user' },
            })).map(jobResult),
          ];
      const matchedResults = [...projectScopedResults, ...personalResults]
        .filter((result) => includesQuery(result, normalizedQuery))
        .sort((left, right) => compareResults(left, right, normalizedQuery));
      const results = matchedResults.slice(0, MAX_RESULTS);

      return {
        contract: commandSearchContract,
        generatedAt,
        projectId: input.projectId,
        query: input.query,
        results,
        totalCount: matchedResults.length,
      };
    },
  };
}
