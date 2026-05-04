import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  ProjectListItem,
  ProjectLookup,
  ProjectMemberRecord,
} from "@shared/contracts/projects";

import type { ProjectsService } from "../services/projects.service";

export interface ProjectsRoutes {
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

export function createProjectsRoutes(service: ProjectsService): ProjectsRoutes {
  return {
    addProjectMember(
      projectId: string,
      input: AddProjectMemberRequest,
      actorUserId: string,
    ): Promise<ProjectMemberRecord> {
      return service.addProjectMember(projectId, input, actorUserId);
    },
    assertProjectMember(projectId: string, actorUserId: string): Promise<void> {
      return service.assertProjectMember(projectId, actorUserId);
    },
    createProject(
      input: CreateProjectRequest,
      actorUserId: string,
    ): Promise<ProjectListItem> {
      return service.createProject(input, actorUserId);
    },
    getProject(
      query: ProjectLookup,
      actorUserId: string,
    ): Promise<ProjectListItem> {
      return service.getProject(query, actorUserId);
    },
    listProjectMembers(
      query: ProjectLookup,
      actorUserId: string,
    ): Promise<ProjectMemberRecord[]> {
      return service.listProjectMembers(query, actorUserId);
    },
    listProjects(actorUserId: string): Promise<ProjectListItem[]> {
      return service.listProjects(actorUserId);
    },
  };
}
