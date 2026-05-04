import type {
  CreateSpaceRequest,
  ListSpacesQuery,
  MembershipQuery,
  SpaceMembership,
  SpaceSummary,
} from "@shared/contracts/spaces";

import type {
  SpaceListRequest,
  SpaceAccessRequest,
  SpacesService,
} from "../services/spaces.service";

export interface SpacesRoutes {
  assertCanReadResource(request: SpaceAccessRequest): Promise<void>;
  createSpace(
    input: CreateSpaceRequest,
    actorUserId: string,
  ): Promise<SpaceSummary>;
  listSpaces(query: SpaceListRequest | ListSpacesQuery): Promise<SpaceSummary[]>;
  listMemberships(
    query: MembershipQuery,
    actorUserId: string,
  ): Promise<SpaceMembership[]>;
}

export function createSpacesRoutes(service: SpacesService): SpacesRoutes {
  return {
    assertCanReadResource(request: SpaceAccessRequest): Promise<void> {
      return service.assertCanReadResource(request);
    },
    createSpace(
      input: CreateSpaceRequest,
      actorUserId: string,
    ): Promise<SpaceSummary> {
      return service.createSpace(input, actorUserId);
    },
    listSpaces(query: SpaceListRequest | ListSpacesQuery): Promise<SpaceSummary[]> {
      if (!query.actorUserId) {
        throw new Error("Space listing requires an actor user id.");
      }

      return service.listSpaces({ actorUserId: query.actorUserId });
    },
    listMemberships(
      query: MembershipQuery,
      actorUserId: string,
    ): Promise<SpaceMembership[]> {
      return service.listMemberships(query, actorUserId);
    },
  };
}
