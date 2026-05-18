import type {
  ProjectWorkspaceDocIndexItem,
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

      return {
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
      };
    },
  };
}
