import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  ProjectListItem,
  ProjectLookup,
  ProjectMemberRecord,
  ProjectRecord,
} from '@shared/contracts/projects';

import type { ProjectRepository, SpaceRepository } from '../../db';

export interface StoredProject extends ProjectRecord {}

export interface StoredProjectMember extends ProjectMemberRecord {}

export interface ProjectsStore {
  projectRepository: ProjectRepository;
  spaceRepository: SpaceRepository;
}

export interface ProjectsService {
  addProjectMember(
    projectId: string,
    input: AddProjectMemberRequest,
    actorUserId: string,
  ): Promise<ProjectMemberRecord>;
  assertProjectMember(projectId: string, actorUserId: string): Promise<void>;
  createProject(
    input: CreateProjectRequest,
    actorUserId: string,
  ): Promise<ProjectListItem>;
  getProject(
    query: ProjectLookup,
    actorUserId: string,
  ): Promise<ProjectListItem>;
  listProjectMembers(
    query: ProjectLookup,
    actorUserId: string,
  ): Promise<ProjectMemberRecord[]>;
  listProjects(actorUserId: string): Promise<ProjectListItem[]>;
}

async function assertSpaceMembership(
  repository: SpaceRepository,
  spaceId: string,
  userId: string,
): Promise<void> {
  const space = await repository.findSpace(spaceId);

  if (!space) {
    throw new Error(`Space ${spaceId} does not exist.`);
  }

  try {
    await repository.denyNonMember(spaceId, userId);
  } catch (error) {
    if (error instanceof Error && /access denied/i.test(error.message)) {
      throw new Error('Access denied for the requested governance space.');
    }

    throw error;
  }
}

async function assertProjectExists(
  repository: ProjectRepository,
  projectId: string,
): Promise<void> {
  const project = await repository.findProject(projectId);

  if (!project) {
    throw new Error(`Project ${projectId} does not exist.`);
  }
}

async function getActorProjectMembership(
  repository: ProjectRepository,
  projectId: string,
  actorUserId: string,
): Promise<ProjectMemberRecord> {
  await assertProjectExists(repository, projectId);
  const membership = await repository.getProjectMember(projectId, actorUserId);

  if (!membership) {
    throw new Error('Access denied for the requested project.');
  }

  return membership;
}

export function createProjectsService(store: ProjectsStore): ProjectsService {
  const { projectRepository, spaceRepository } = store;

  return {
    async addProjectMember(
      projectId: string,
      input: AddProjectMemberRequest,
      actorUserId: string,
    ): Promise<ProjectMemberRecord> {
      const actorMembership = await getActorProjectMembership(
        projectRepository,
        projectId,
        actorUserId,
      );

      if (actorMembership.role !== 'owner') {
        throw new Error('Access denied for project membership management.');
      }

      return projectRepository.addProjectMember(projectId, input);
    },
    async assertProjectMember(
      projectId: string,
      actorUserId: string,
    ): Promise<void> {
      await getActorProjectMembership(projectRepository, projectId, actorUserId);
    },
    async createProject(
      input: CreateProjectRequest,
      actorUserId: string,
    ): Promise<ProjectListItem> {
      await assertSpaceMembership(spaceRepository, input.spaceId, actorUserId);

      return projectRepository.createProject(
        {
          description: input.description,
          name: input.name,
          spaceId: input.spaceId,
          status: input.status,
        },
        actorUserId,
      );
    },
    async getProject(
      query: ProjectLookup,
      actorUserId: string,
    ): Promise<ProjectListItem> {
      await assertProjectExists(projectRepository, query.projectId);
      const project = await projectRepository.getProjectForActor(
        query.projectId,
        actorUserId,
      );

      if (!project) {
        throw new Error('Access denied for the requested project.');
      }

      return project;
    },
    async listProjectMembers(
      query: ProjectLookup,
      actorUserId: string,
    ): Promise<ProjectMemberRecord[]> {
      await getActorProjectMembership(
        projectRepository,
        query.projectId,
        actorUserId,
      );

      return projectRepository.listProjectMembers(query.projectId);
    },
    async listProjects(actorUserId: string): Promise<ProjectListItem[]> {
      return projectRepository.listProjectsForActor(actorUserId);
    },
  };
}
