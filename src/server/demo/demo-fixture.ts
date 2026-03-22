import type { LibraryEntryVisibility } from '@shared/contracts/library';
import type { SpaceMembership } from '@shared/contracts/spaces';

import type { JixiaAppState } from '../app';
import type {
  StoredLibraryEntry,
  StoredPaperAsset,
} from '../services/import.service';
import type { StoredSpace } from '../services/spaces.service';
import type { StoredWritingDoc } from '../services/writing.service';

const FIXTURE_CREATED_AT = '2026-03-22T00:00:00.000Z';
const DEMO_VISIBILITY: LibraryEntryVisibility = 'space_shared';

export const nativeDemoFixture = {
  actorUserId: 'demo-operator',
  credentialProvider: 'openai',
  credentialRef: 'cred-demo',
  documentId: 'doc-1',
  documentTitle: 'Tumor board synthesis',
  entryId: 'entry-1',
  importLocator: 'pmid:123456',
  jobKind: 'ai.summary',
  nextSequenceFloor: 1,
  projectId: 'tumor-board',
  sharedSpaceId: 'shared-space',
  sharedSpaceName: 'Shared Space',
  visibility: DEMO_VISIBILITY,
} as const;

function createSharedSpace(): StoredSpace {
  return {
    createdAt: FIXTURE_CREATED_AT,
    description: 'Deterministic shared space for the native Jixia demo.',
    id: nativeDemoFixture.sharedSpaceId,
    kind: 'shared',
    name: nativeDemoFixture.sharedSpaceName,
    ownerUserId: nativeDemoFixture.actorUserId,
  };
}

function createSharedMembership(): SpaceMembership {
  return {
    joinedAt: FIXTURE_CREATED_AT,
    role: 'owner',
    spaceId: nativeDemoFixture.sharedSpaceId,
    userId: nativeDemoFixture.actorUserId,
  };
}

function createDemoPaperAsset(): StoredPaperAsset {
  return {
    abstractText: 'Imported PMID metadata for 123456',
    canonicalId: nativeDemoFixture.importLocator,
    createdAt: FIXTURE_CREATED_AT,
    id: 'asset-pmid-123456',
    importedByUserId: nativeDemoFixture.actorUserId,
    title: 'Imported PMID paper 123456',
  };
}

function createDemoEntry(paperAssetId: string): StoredLibraryEntry {
  return {
    addedAt: FIXTURE_CREATED_AT,
    id: nativeDemoFixture.entryId,
    paperAssetId,
    spaceId: nativeDemoFixture.sharedSpaceId,
    visibility: nativeDemoFixture.visibility,
  };
}

function createDemoDocument(): StoredWritingDoc {
  return {
    createdAt: FIXTURE_CREATED_AT,
    id: nativeDemoFixture.documentId,
    ownerUserId: nativeDemoFixture.actorUserId,
    publishState: 'draft',
    spaceId: nativeDemoFixture.sharedSpaceId,
    title: nativeDemoFixture.documentTitle,
  };
}

export function createEmptyAppState(): JixiaAppState {
  return {
    auditLogs: [],
    citationLinks: [],
    conversations: [],
    credentials: [],
    docVersions: [],
    insights: [],
    jobEvents: [],
    jobs: [],
    libraryEntries: [],
    memberships: [],
    nextSequence: 0,
    notes: [],
    paperAssets: [],
    spaces: [],
    writingDocs: [],
  };
}

function patchRecord<T extends object>(target: T, source: T): boolean {
  let changed = false;

  for (const [key, value] of Object.entries(source) as Array<
    [keyof T, T[keyof T]]
  >) {
    if (target[key] !== value) {
      target[key] = value;
      changed = true;
    }
  }

  return changed;
}

export function applyNativeDemoFixture(state: JixiaAppState): boolean {
  let changed = false;

  const desiredSpace = createSharedSpace();
  const existingSpace = state.spaces.find(
    (space) => space.id === nativeDemoFixture.sharedSpaceId,
  );

  if (existingSpace) {
    changed = patchRecord(existingSpace, desiredSpace) || changed;
  } else {
    state.spaces.push(desiredSpace);
    changed = true;
  }

  const desiredMembership = createSharedMembership();
  const existingMembership = state.memberships.find(
    (membership) =>
      membership.spaceId === desiredMembership.spaceId &&
      membership.userId === desiredMembership.userId,
  );

  if (existingMembership) {
    changed = patchRecord(existingMembership, desiredMembership) || changed;
  } else {
    state.memberships.push(desiredMembership);
    changed = true;
  }

  const desiredPaperAsset = createDemoPaperAsset();
  const existingPaperAsset = state.paperAssets.find(
    (asset) =>
      asset.id === desiredPaperAsset.id ||
      asset.canonicalId === desiredPaperAsset.canonicalId,
  );
  const paperAssetId = existingPaperAsset?.id ?? desiredPaperAsset.id;

  if (existingPaperAsset) {
    changed = patchRecord(existingPaperAsset, desiredPaperAsset) || changed;
  } else {
    state.paperAssets.push(desiredPaperAsset);
    changed = true;
  }

  const desiredEntry = createDemoEntry(paperAssetId);
  const existingEntry = state.libraryEntries.find(
    (entry) => entry.id === desiredEntry.id,
  );

  if (existingEntry) {
    changed = patchRecord(existingEntry, desiredEntry) || changed;
  } else {
    state.libraryEntries.push(desiredEntry);
    changed = true;
  }

  const desiredDocument = createDemoDocument();
  const existingDocument = state.writingDocs.find(
    (document) => document.id === desiredDocument.id,
  );

  if (existingDocument) {
    changed = patchRecord(existingDocument, desiredDocument) || changed;
  } else {
    state.writingDocs.push(desiredDocument);
    changed = true;
  }

  if (state.nextSequence < nativeDemoFixture.nextSequenceFloor) {
    state.nextSequence = nativeDemoFixture.nextSequenceFloor;
    changed = true;
  }

  return changed;
}
