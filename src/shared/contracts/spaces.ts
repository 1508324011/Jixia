import type { LibraryEntryVisibility } from './library';

export type SpaceKind = 'personal' | 'shared';

export type SpaceRole = 'owner' | 'editor' | 'viewer';

export interface CreateSpaceRequest {
  name: string;
  kind: SpaceKind;
  description?: string;
}

export interface MembershipQuery {
  spaceId: string;
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

export interface DemoSpaceRecord {
  spaceId: string;
  name: string;
  kind: SpaceKind;
  projectId: string;
  importLocator: string;
  visibility: LibraryEntryVisibility;
}

export interface DemoSpaceListResponse {
  spaces: DemoSpaceRecord[];
}

export interface DemoSpaceResponse {
  space: DemoSpaceRecord;
}

export const spacesContract = 'jixia-spaces-contract';
