export type ScopeRef =
  | { type: "user"; id: string }
  | { type: "project"; id: string };

export type ProjectStatus = "active" | "archived";

export type ProjectMemberRole = "owner" | "editor" | "viewer";

export interface CreateProjectRequest {
  description?: string;
  name: string;
  spaceId: string;
  status?: ProjectStatus;
}

export interface ProjectLookup {
  projectId: string;
}

export interface ProjectRecord {
  id: string;
  spaceId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberRecord {
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  joinedAt: string;
}

export interface ProjectListItem {
  membership: ProjectMemberRecord;
  project: ProjectRecord;
}

export interface AddProjectMemberRequest {
  role: ProjectMemberRole;
  userId: string;
}

export const projectsContract = "jixia-projects-contract";
