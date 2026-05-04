export type SpaceKind = "personal" | "shared";

export type SpaceRole = "owner" | "editor" | "viewer";

export interface CreateSpaceRequest {
  name: string;
  kind: SpaceKind;
  description?: string;
}

export interface MembershipQuery {
  spaceId: string;
}

export interface ListSpacesQuery {
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  actorUserId?: string;
}

export interface SpaceSummary {
  id: string;
  name: string;
  kind: SpaceKind;
  createdAt: string;
}

export interface SpaceMembership {
  spaceId: string;
  userId: string;
  role: SpaceRole;
  joinedAt: string;
}

export const spacesContract = "jixia-spaces-contract";
