import type { LibraryEntryVisibility } from '@shared/contracts/library';
import type {
  CreateSpaceRequest,
  MembershipQuery,
  SpaceMembership,
  SpaceSummary,
} from '@shared/contracts/spaces';

import { assertCanReadResource } from '../policies/access-policy';

export interface StoredSpace extends SpaceSummary {
  description?: string;
  ownerUserId: string;
}

export interface SpaceAccessRequest {
  actorSpaceId: string;
  actorUserId: string;
  resourceSpaceId: string;
  visibility: LibraryEntryVisibility;
}

export interface SpacesStore {
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  spaces: StoredSpace[];
}

export interface SpacesService {
  assertCanReadResource(request: SpaceAccessRequest): Promise<void>;
  createSpace(
    input: CreateSpaceRequest,
    actorUserId: string,
  ): Promise<SpaceSummary>;
  listMemberships(query: MembershipQuery): Promise<SpaceMembership[]>;
}

function findSpace(store: SpacesStore, spaceId: string): StoredSpace {
  const space = store.spaces.find((candidate) => candidate.id === spaceId);

  if (!space) {
    throw new Error(`Space ${spaceId} does not exist.`);
  }

  return space;
}

export function createSpacesService(store: SpacesStore): SpacesService {
  return {
    async createSpace(
      input: CreateSpaceRequest,
      actorUserId: string,
    ): Promise<SpaceSummary> {
      const createdAt = new Date().toISOString();
      const space: StoredSpace = {
        createdAt,
        description: input.description,
        id: store.nextId('space'),
        kind: input.kind,
        name: input.name,
        ownerUserId: actorUserId,
      };

      store.spaces.push(space);
      store.memberships.push({
        joinedAt: createdAt,
        role: 'owner',
        spaceId: space.id,
        userId: actorUserId,
      });

      return {
        createdAt: space.createdAt,
        id: space.id,
        kind: space.kind,
        name: space.name,
      };
    },
    async listMemberships(query: MembershipQuery): Promise<SpaceMembership[]> {
      return store.memberships.filter(
        (membership) => membership.spaceId === query.spaceId,
      );
    },
    async assertCanReadResource(request: SpaceAccessRequest): Promise<void> {
      const resourceSpace = findSpace(store, request.resourceSpaceId);
      const actorHasResourceMembership = store.memberships.some(
        (membership) =>
          membership.spaceId === request.resourceSpaceId &&
          membership.userId === request.actorUserId,
      );

      assertCanReadResource({
        actorHasResourceMembership,
        actorSpaceId: request.actorSpaceId,
        actorUserId: request.actorUserId,
        resourceOwnerUserId: resourceSpace.ownerUserId,
        resourceSpaceId: request.resourceSpaceId,
        visibility: request.visibility,
      });
    },
  };
}
