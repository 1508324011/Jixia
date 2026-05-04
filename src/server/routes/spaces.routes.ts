import type {
  CreateSpaceRequest,
  ListSpacesQuery,
  MembershipQuery,
  SpaceMembership,
  SpaceSummary,
} from "@shared/contracts/spaces";

import type {
  SpaceAccessRequest,
  SpacesService,
} from "../services/spaces.service";

export interface SpacesRoutes {
  assertCanReadResource(request: SpaceAccessRequest): Promise<void>;
  createSpace(
    input: CreateSpaceRequest,
    actorUserId: string,
  ): Promise<SpaceSummary>;
  listSpaces(query: ListSpacesQuery): Promise<SpaceSummary[]>;
  listMemberships(query: MembershipQuery): Promise<SpaceMembership[]>;
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
    listSpaces(query: ListSpacesQuery): Promise<SpaceSummary[]> {
      return service.listSpaces(query);
    },
    listMemberships(query: MembershipQuery): Promise<SpaceMembership[]> {
      return service.listMemberships(query);
    },
  };
}
