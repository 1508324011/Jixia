import type {
  ProjectWorkspaceActivityItem,
  ProjectWorkspaceDocIndexItem,
  ProjectWorkspaceResourceItem,
  ProjectWorkspaceResponse,
} from '@shared/contracts/projects';
import { projectsContract } from '@shared/contracts/projects';

import type {
  ProjectDocRepository,
  ProjectRepository,
  PersistedProjectDocIndexItem,
} from '../../db';

export interface ProjectWorkspaceStore {
  projectDocRepository: ProjectDocRepository;
  projectRepository: ProjectRepository;
}

export interface ProjectWorkspaceService {
  getWorkspace(projectId: string, actorUserId: string): Promise<ProjectWorkspaceResponse>;
}

const emptyProjectDocsIndex = {
  body: 'No Project Docs have been created for this project yet. Use Project Docs to maintain shared background, evidence, rationale, conclusions, and formal drafts for the team.',
  title: 'No Project Docs yet',
};

const emptyProjectActivitySection = {
  body: 'Project activity will appear when Project Docs, project Library resources, Reader comments or evidence, and governed project jobs change.',
  title: 'No project activity yet',
};

const emptyProjectResourcesSection = {
  body: 'Project resources will appear when the team creates Project Docs or adopts literature into the project-scoped Library.',
  title: 'No project resources yet',
};

const projectWorkspaceActivityLimit = 8;

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

function compareActivityItems(
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
      const activityItems = docIndexDocuments
        .map(buildProjectDocActivityItem)
        .sort(compareActivityItems);
      const resourceItems = docIndexDocuments.map(buildProjectDocResourceItem);

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
