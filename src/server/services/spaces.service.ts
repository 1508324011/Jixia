import type { LibraryEntryVisibility } from "@shared/contracts/library";
import type {
  CreateSpaceRequest,
  MembershipQuery,
  SpaceMembership,
  SpaceSummary,
} from "@shared/contracts/spaces";

import type {
  PersistedSpaceMembershipRecord,
  SpaceRepository,
} from "../../db";
import { assertCanReadResource } from "../policies/access-policy";

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

export interface SpacesService {
  assertCanReadResource(request: SpaceAccessRequest): Promise<void>;
  createSpace(
    input: CreateSpaceRequest,
    actorUserId: string,
  ): Promise<SpaceSummary>;
  listSpaces(query: SpaceListRequest): Promise<SpaceSummary[]>;
  listMemberships(
    query: MembershipQuery,
    actorUserId: string,
  ): Promise<SpaceMembership[]>;
}

export interface SpaceListRequest {
  actorUserId: string;
}

function mapMembership(
  membership: PersistedSpaceMembershipRecord,
): SpaceMembership {
  return {
    joinedAt: membership.joinedAt,
    role: membership.role,
    spaceId: membership.spaceId,
    userId: membership.userId,
  };
}

async function requireOwnerUserId(
  repository: SpaceRepository,
  spaceId: string,
): Promise<string> {
  const memberships = await repository.listMemberships({ spaceId });
  const ownerMembership = memberships.find((membership) => membership.role === "owner");

  if (!ownerMembership) {
    throw new Error(`Space ${spaceId} is missing its owner membership.`);
  }

  return ownerMembership.userId;
}

export interface SpacesStore {
  repository: SpaceRepository;
}

export function createSpacesService(store: SpacesStore): SpacesService {
  const { repository } = store;

  return {
    async createSpace(
      input: CreateSpaceRequest,
      actorUserId: string,
    ): Promise<SpaceSummary> {
      const space = await repository.createSpace(
        input,
        actorUserId,
      );
      const ownerMembership = await repository.getMembership(space.id, actorUserId);

      if (!ownerMembership) {
        throw new Error("Created space is missing its owner membership.");
      }

      return {
        createdAt: space.createdAt,
        id: space.id,
        kind: space.kind,
        name: space.name,
      };
    },
    async listMemberships(
      query: MembershipQuery,
      actorUserId: string,
    ): Promise<SpaceMembership[]> {
      await repository.denyNonMember(query.spaceId, actorUserId);

      return (await repository.listMemberships(query)).map(mapMembership);
    },
    async listSpaces(query: SpaceListRequest): Promise<SpaceSummary[]> {
      return (await repository.listSpacesForActor(query.actorUserId)).map((space) => ({
        createdAt: space.createdAt,
        id: space.id,
        kind: space.kind,
        name: space.name,
      }));
    },
    async assertCanReadResource(request: SpaceAccessRequest): Promise<void> {
      const resourceSpace = await repository.findSpace(request.resourceSpaceId);

      if (!resourceSpace) {
        throw new Error(`Space ${request.resourceSpaceId} does not exist.`);
      }

      const actorHasResourceMembership = Boolean(
        await repository.getMembership(
          request.resourceSpaceId,
          request.actorUserId,
        ),
      );
      const resourceOwnerUserId = await requireOwnerUserId(
        repository,
        request.resourceSpaceId,
      );

      assertCanReadResource({
        actorHasResourceMembership,
        actorSpaceId: request.actorSpaceId,
        actorUserId: request.actorUserId,
        resourceOwnerUserId,
        resourceSpaceId: request.resourceSpaceId,
        visibility: request.visibility,
      });
    },
  };
}
