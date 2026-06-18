export const spaceRoles = ["SpaceAdmin", "SpaceMember"] as const;
export type SpaceRole = (typeof spaceRoles)[number];

export const projectRoles = ["ProjectOwner", "ProjectEditor", "ProjectViewer"] as const;
export type ProjectRole = (typeof projectRoles)[number];

export const membershipRoles = [...spaceRoles, ...projectRoles] as const;
export type MembershipRole = (typeof membershipRoles)[number];

export type CurrentUserSpaceView = {
  readonly id: string;
  readonly name: string;
  readonly role: SpaceRole;
};

export type CurrentUserProjectMembershipView = {
  readonly projectId: string;
  readonly projectName: string;
  readonly role: ProjectRole;
};

export type CurrentUserView = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly space: CurrentUserSpaceView;
  readonly projectMemberships: readonly CurrentUserProjectMembershipView[];
};

export type CurrentSessionView = {
  readonly user: CurrentUserView;
  readonly expiresAt: string;
};

export type LoginRequest = {
  readonly email: string;
  readonly password: string;
};

export type LoginResponse = {
  readonly currentSession: CurrentSessionView;
};

export type AuthMeResponse = {
  readonly currentSession: CurrentSessionView;
};

export type AuthMutationResponse = {
  readonly ok: true;
};

export type ProjectDTO = {
  readonly id: string;
  readonly spaceId: string;
  readonly name: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ProjectMemberUserView = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
};

export type ProjectMembershipDTO = {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: ProjectRole;
  readonly member: ProjectMemberUserView;
  readonly createdAt: string;
};

export type CreateProjectRequest = {
  readonly spaceId?: string;
  readonly name: string;
};

export type CreateProjectResponse = {
  readonly project: ProjectDTO;
  readonly membership: ProjectMembershipDTO;
};

export type AddProjectMemberRequest = {
  readonly projectId: string;
  readonly userId: string;
  readonly role: Exclude<ProjectRole, "ProjectOwner">;
};

export type UpdateProjectMemberRoleRequest = {
  readonly projectId: string;
  readonly userId: string;
  readonly role: ProjectRole;
};

export type RemoveProjectMemberRequest = {
  readonly projectId: string;
  readonly userId: string;
};

export type ProjectMembersResponse = {
  readonly projectId: string;
  readonly members: readonly ProjectMembershipDTO[];
};

export type InvitationDTO = {
  readonly id: string;
  readonly spaceId: string;
  readonly email: string;
  readonly role: SpaceRole;
  readonly invitedByUserId: string;
  readonly acceptedByUserId: string | null;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly createdAt: string;
};

export type CreateInvitationRequest = {
  readonly email: string;
  readonly role: SpaceRole;
};

export type CreateInvitationResponse = {
  readonly invitation: InvitationDTO;
};

export type AcceptInvitationRequest = {
  readonly invitationToken: string;
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
};

export type AcceptInvitationResponse = {
  readonly currentSession: CurrentSessionView;
};

export function isSpaceRole(value: string): value is SpaceRole {
  return (spaceRoles as readonly string[]).includes(value);
}

export function isProjectRole(value: string): value is ProjectRole {
  return (projectRoles as readonly string[]).includes(value);
}
