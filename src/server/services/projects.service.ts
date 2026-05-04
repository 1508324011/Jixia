import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  ProjectListItem,
  ProjectLookup,
  ProjectMemberRecord,
  ProjectRecord,
} from "@shared/contracts/projects";
import type { SpaceMembership } from "@shared/contracts/spaces";

import type { StoredSpace } from "./spaces.service";

export interface StoredProject extends ProjectRecord {}

export interface StoredProjectMember extends ProjectMemberRecord {}

export interface ProjectsStore {
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  persist(): void;
  projectMembers: StoredProjectMember[];
  projects: StoredProject[];
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

function findProject(store: ProjectsStore, projectId: string): StoredProject {
  const project = store.projects.find((candidate) => candidate.id === projectId);

  if (!project) {
    throw new Error(`Project ${projectId} does not exist.`);
  }

  return project;
}

function findProjectMembership(
  store: ProjectsStore,
  projectId: string,
  userId: string,
): StoredProjectMember | undefined {
  return store.projectMembers.find(
    (membership) =>
      membership.projectId === projectId && membership.userId === userId,
  );
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
    throw new Error("Access denied for the requested governance space.");
  }
}

function assertProjectOwner(
  store: ProjectsStore,
  projectId: string,
  actorUserId: string,
): void {
  const membership = findProjectMembership(store, projectId, actorUserId);

  if (membership?.role !== "owner") {
    throw new Error("Access denied for project membership management.");
  }
}

function toListItem(
  store: ProjectsStore,
  project: StoredProject,
  actorUserId: string,
): ProjectListItem {
  const membership = findProjectMembership(store, project.id, actorUserId);

  if (!membership) {
    throw new Error("Access denied for the requested project.");
  }

  return { membership, project };
}

export function createProjectsService(store: ProjectsStore): ProjectsService {
  return {
    async addProjectMember(
      projectId: string,
      input: AddProjectMemberRequest,
      actorUserId: string,
    ): Promise<ProjectMemberRecord> {
      const project = findProject(store, projectId);
      assertProjectOwner(store, project.id, actorUserId);
      findSpace(store, project.spaceId);

      const existingMembership = findProjectMembership(
        store,
        project.id,
        input.userId,
      );
      if (existingMembership) {
        return existingMembership;
      }

      const membership: StoredProjectMember = {
        joinedAt: new Date().toISOString(),
        projectId: project.id,
        role: input.role,
        userId: input.userId,
      };

      store.projectMembers.push(membership);
      store.persist();

      return membership;
    },
    async assertProjectMember(
      projectId: string,
      actorUserId: string,
    ): Promise<void> {
      findProject(store, projectId);

      if (!findProjectMembership(store, projectId, actorUserId)) {
        throw new Error("Access denied for the requested project.");
      }
    },
    async createProject(
      input: CreateProjectRequest,
      actorUserId: string,
    ): Promise<ProjectListItem> {
      findSpace(store, input.spaceId);
      assertSpaceMembership(store, input.spaceId, actorUserId);

      const now = new Date().toISOString();
      const project: StoredProject = {
        createdAt: now,
        createdByUserId: actorUserId,
        description: input.description,
        id: store.nextId("project"),
        name: input.name,
        spaceId: input.spaceId,
        status: input.status ?? "active",
        updatedAt: now,
      };
      const membership: StoredProjectMember = {
        joinedAt: now,
        projectId: project.id,
        role: "owner",
        userId: actorUserId,
      };

      store.projects.push(project);
      store.projectMembers.push(membership);
      store.persist();

      return { membership, project };
    },
    async getProject(
      query: ProjectLookup,
      actorUserId: string,
    ): Promise<ProjectListItem> {
      return toListItem(store, findProject(store, query.projectId), actorUserId);
    },
    async listProjectMembers(
      query: ProjectLookup,
      actorUserId: string,
    ): Promise<ProjectMemberRecord[]> {
      await this.assertProjectMember(query.projectId, actorUserId);

      return store.projectMembers.filter(
        (membership) => membership.projectId === query.projectId,
      );
    },
    async listProjects(actorUserId: string): Promise<ProjectListItem[]> {
      const visibleProjectIds = new Set(
        store.projectMembers
          .filter((membership) => membership.userId === actorUserId)
          .map((membership) => membership.projectId),
      );

      return store.projects
        .filter((project) => visibleProjectIds.has(project.id))
        .map((project) => toListItem(store, project, actorUserId));
    },
  };
}
