import { expect } from 'vitest';

const DOCUMENT_BLOCK_AUTHORITY_FIELDS = [
  'actorSpaceId',
  'actorUserId',
  'authorUserId',
  'createdByUserId',
  'ownerId',
  'projectId',
  'requestedByUserId',
  'scope',
  'scopeId',
  'scopeType',
  'spaceId',
  'startedByUserId',
  'userId',
  'visibility',
] as const;

export function expectDocumentBlocksToOmitAuthorityFields(
  documentContent: { blocks?: unknown[] } | null | undefined,
): void {
  expect(documentContent).toBeDefined();
  expect(Array.isArray(documentContent?.blocks)).toBe(true);

  for (const block of documentContent?.blocks ?? []) {
    for (const field of DOCUMENT_BLOCK_AUTHORITY_FIELDS) {
      expect(block).not.toHaveProperty(field);
    }
  }
}
