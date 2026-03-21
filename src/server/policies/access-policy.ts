import type { LibraryEntryVisibility } from '@shared/contracts/library';

export interface ResourceAccessInput {
  actorSpaceId: string;
  actorUserId: string;
  actorHasResourceMembership: boolean;
  resourceOwnerUserId: string;
  resourceSpaceId: string;
  visibility: LibraryEntryVisibility;
}

export function canReadResource(input: ResourceAccessInput): boolean {
  switch (input.visibility) {
    case 'private':
      return (
        input.actorUserId === input.resourceOwnerUserId &&
        input.actorSpaceId === input.resourceSpaceId
      );
    case 'space_shared':
      return (
        input.actorSpaceId === input.resourceSpaceId &&
        input.actorHasResourceMembership
      );
    case 'published_to_project':
      return input.actorHasResourceMembership;
  }
}

export function assertCanReadResource(input: ResourceAccessInput): void {
  if (!canReadResource(input)) {
    throw new Error('Access denied for the requested space resource.');
  }
}
