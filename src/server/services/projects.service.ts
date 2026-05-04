import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  ProjectListItem,
  ProjectLookup,
  ProjectMemberRecord,
  ProjectRecord,
} from '@shared/contracts/projects';
import type { SpaceMembership } from '@shared/contracts/spaces';

import type { ProjectRepository } from '../../db';
import type { StoredSpace } from './spaces.service';

export interface StoredProject extends ProjectRecord {}

export interface StoredProjectMember extends ProjectMemberRecord {}

export interface ProjectsStore {
  memberships: SpaceMembership[];
  projectRepository: ProjectRepository;
  spaces: StoredSpace[];
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

function findSpace(store: ProjectsStore, spaceId: string): StoredSpace {
  const space = store.spaces.find((candidate) => candidate.id === spaceId);

  if (!space) {
    throw new Error(`Space ${spaceId} does not exist.`);
  }

  return space;
}

function assertSpaceMembership(
  store: ProjectsStore,
  spaceId: string,
  userId: string,
): void {
  const hasMembership = store.memberships.some(
    (membership) => membership.spaceId === spaceId && membership.userId === userId,
  );

  if (!hasMembership) {
    throw new Error('Access denied for the requested governance space.');
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
  const { projectRepository } = store;

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
      findSpace(store, input.spaceId);
      assertSpaceMembership(store, input.spaceId, actorUserId);

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
