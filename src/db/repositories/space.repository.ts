export interface CreateSpaceParams {
  name: string;
  kind: 'personal' | 'shared';
  description?: string;
}

export interface MembershipLookup {
  spaceId: string;
}

export interface PersistedSpaceRecord {
  id: string;
  name: string;
  kind: 'personal' | 'shared';
  createdAt: string;
}

export interface PersistedSpaceMembershipRecord {
  spaceId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: string;
}

export interface SpaceRepository {
  createSpace(input: CreateSpaceParams): Promise<PersistedSpaceRecord>;
  listMemberships(
    query: MembershipLookup,
  ): Promise<PersistedSpaceMembershipRecord[]>;
}

export function createSpaceRepository(): SpaceRepository {
  return {
    async createSpace(): Promise<PersistedSpaceRecord> {
      throw new Error('SpaceRepository.createSpace is not implemented yet.');
    },
    async listMemberships(): Promise<PersistedSpaceMembershipRecord[]> {
      throw new Error(
        'SpaceRepository.listMemberships is not implemented yet.',
      );
    },
  };
}
