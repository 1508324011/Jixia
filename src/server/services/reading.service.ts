import type {
  GeneratedInsightRecord,
  EvidenceCardRecord,
  EvidenceSpanRecord,
} from '@shared/contracts/evidence';
import type {
  ConversationRecord,
  NoteRecord,
  NoteVisibility,
  ReadingCompanionView,
  ReadingDocumentView,
  ReadingDetailView,
  ReadingWorkspaceView,
} from '@shared/contracts/reading';
import { documentReadyReadingRetrievalState } from '@shared/contracts/reading';
import type { SpaceMembership } from '@shared/contracts/spaces';

import {
  assertCanReadResource,
  canReadResource,
} from '../policies/access-policy';
import type {
  StoredLibraryEntry,
  StoredPaperAsset,
} from './import.service';
import type { StoredSpace } from './spaces.service';
import type { EvidenceLinkService } from './evidence-link.service';
import type { NotebookService } from './notebook.service';

export interface CreateNoteRequest {
  actorSpaceId: string;
  authorUserId: string;
  body: string;
  libraryEntryId: string;
  visibility: NoteVisibility;
}

export interface SaveGeneratedInsightRequest {
  actorSpaceId: string;
  evidenceSpans: Omit<EvidenceSpanRecord, 'paperAssetId'>[];
  libraryEntryId: string;
  startedByUserId: string;
  summary: string;
  title: string;
}

export interface GetReadingDetailRequest {
  actorSpaceId: string;
  actorUserId: string;
  libraryEntryId: string;
}

export interface GetWorkbenchReadingDetailRequest {
  actorUserId: string;
  libraryEntryId: string;
}

export interface CreateWorkbenchNoteRequest {
  authorUserId: string;
  body: string;
  libraryEntryId: string;
  visibility: NoteVisibility;
}

export interface SaveWorkbenchGeneratedInsightRequest {
  evidenceSpans: Omit<EvidenceSpanRecord, 'paperAssetId'>[];
  libraryEntryId: string;
  startedByUserId: string;
  summary: string;
  title: string;
}

export interface ReadingStore {
  conversations: ConversationRecord[];
  evidenceCards: EvidenceCardRecord[];
  evidenceLinkService: EvidenceLinkService;
  insights: GeneratedInsightRecord[];
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  notebookService: NotebookService;
  notes: NoteRecord[];
  paperAssets: StoredPaperAsset[];
  persist(): void;
  spaces: StoredSpace[];
}

export interface ReadingService {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  createWorkbenchNote(input: CreateWorkbenchNoteRequest): Promise<NoteRecord>;
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetailView | null>;
  getWorkbenchDetail(
    input: GetWorkbenchReadingDetailRequest,
  ): Promise<ReadingDetailView | null>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
  saveWorkbenchGeneratedInsight(
    input: SaveWorkbenchGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
}

const DEFAULT_PROJECT_ID = 'tumor-board';
const DEFAULT_PROJECT_SPACE_ID = 'shared-space';
const DEFAULT_PROJECT_DOCUMENT_ID = 'doc-1';

function getLibraryContext(store: ReadingStore, libraryEntryId: string): {
  asset: StoredPaperAsset;
  entry: StoredLibraryEntry;
  space: StoredSpace;
} {
  const entry = store.libraryEntries.find(
    (candidate) => candidate.id === libraryEntryId,
  );

  if (!entry) {
    throw new Error(`Library entry ${libraryEntryId} does not exist.`);
  }

  const asset = store.paperAssets.find(
    (candidate) => candidate.id === entry.paperAssetId,
  );

  if (!asset) {
    throw new Error(`Paper asset ${entry.paperAssetId} does not exist.`);
  }

  const space = store.spaces.find((candidate) => candidate.id === entry.spaceId);

  if (!space) {
    throw new Error(`Space ${entry.spaceId} does not exist.`);
  }

  return { asset, entry, space };
}

function assertEntryAccess(
  store: ReadingStore,
  actorUserId: string,
  actorSpaceId: string,
  libraryEntryId: string,
): void {
  const { entry, space } = getLibraryContext(store, libraryEntryId);
  const actorHasResourceMembership = store.memberships.some(
    (membership) =>
      membership.spaceId === entry.spaceId && membership.userId === actorUserId,
  );

  assertCanReadResource({
    actorHasResourceMembership,
    actorSpaceId,
    actorUserId,
    resourceOwnerUserId: space.ownerUserId,
    resourceSpaceId: entry.spaceId,
    visibility: entry.visibility,
  });
}

function toReadingNote(
  input: { createdAt: string; id: string; ownerUserId: string; text: string },
  libraryEntryId: string,
): NoteRecord {
  return {
    authorUserId: input.ownerUserId,
    body: input.text,
    createdAt: input.createdAt,
    id: input.id,
    libraryEntryId,
    visibility: 'private',
  };
}

function buildProjectScopedPath(
  projectId: string,
  spaceId: string,
  suffix?: string,
): string {
  const pathname = suffix
    ? `/projects/${projectId}/${suffix}`
    : `/projects/${projectId}`;

  if (spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function buildWorkspaceCompanion(
  entry: StoredLibraryEntry,
  space: StoredSpace,
): ReadingCompanionView {
  if (space.kind === 'personal') {
    return {
      notebookPath: `/library/${entry.id}/notes`,
      readerPath: `/library/${entry.id}/reader`,
    };
  }

  return {
    notebookPath: buildProjectScopedPath(
      DEFAULT_PROJECT_ID,
      entry.spaceId,
      `library/${entry.id}/notes`,
    ),
    projectDocsPath: buildProjectScopedPath(
      DEFAULT_PROJECT_ID,
      entry.spaceId,
      `writing/${DEFAULT_PROJECT_DOCUMENT_ID}`,
    ),
    projectPath: buildProjectScopedPath(DEFAULT_PROJECT_ID, entry.spaceId),
    readerPath: buildProjectScopedPath(
      DEFAULT_PROJECT_ID,
      entry.spaceId,
      `library/${entry.id}/reader`,
    ),
  };
}

function buildReadingDocument(asset: StoredPaperAsset): ReadingDocumentView {
  const overviewParagraphs = [
    asset.title,
    asset.abstractText?.trim() || 'No abstract was imported for this record.',
    'Reader now treats the paper as a document surface instead of a metadata companion panel.',
  ];

  return {
    sections: [
      {
        body: overviewParagraphs.join('\n\n'),
        id: 'section-overview',
        title: 'Overview',
      },
    ],
    title: asset.title,
  };
}

async function buildWorkspaceView(
  store: ReadingStore,
  input: {
    actorUserId: string;
    libraryEntryId: string;
    sharedComments: NoteRecord[];
  },
): Promise<ReadingWorkspaceView> {
  const { entry, space } = getLibraryContext(store, input.libraryEntryId);
  const notebook = await store.notebookService.getNotebookForLibraryEntry({
    libraryEntryId: input.libraryEntryId,
    ownerUserId: input.actorUserId,
  });
  const privateNotes = (await store.notebookService.listNotes({
    libraryEntryId: input.libraryEntryId,
    ownerUserId: input.actorUserId,
  })).map((note) => toReadingNote(note, input.libraryEntryId));

  return {
    companion: buildWorkspaceCompanion(entry, space),
    notebookId: notebook.id,
    sharedComments: input.sharedComments,
  };
}

function createEvidenceCards(
  store: ReadingStore,
  input: {
    evidenceSpans: Omit<EvidenceSpanRecord, 'paperAssetId'>[];
    paperAssetId: string;
    scope: EvidenceCardRecord['scope'];
  },
): void {
  for (const span of input.evidenceSpans) {
    store.evidenceCards.push({
      createdAt: new Date().toISOString(),
      id: store.nextId('evidence-card'),
      paperAssetId: input.paperAssetId,
      quote: span.quote,
      scope: input.scope,
    });
  }
}

export function createReadingService(store: ReadingStore): ReadingService {
  return {
    async getDetail(
      input: GetReadingDetailRequest,
    ): Promise<ReadingDetailView | null> {
      const entry = store.libraryEntries.find(
        (candidate) => candidate.id === input.libraryEntryId,
      );

      if (!entry) {
        return null;
      }

      const asset = store.paperAssets.find(
        (candidate) => candidate.id === entry.paperAssetId,
      );

      if (!asset) {
        return null;
      }

      const space = store.spaces.find((candidate) => candidate.id === entry.spaceId);

      if (!space) {
        throw new Error(`Space ${entry.spaceId} does not exist.`);
      }

      const actorHasResourceMembership = store.memberships.some(
        (membership) =>
          membership.spaceId === entry.spaceId &&
          membership.userId === input.actorUserId,
      );

      assertCanReadResource({
        actorHasResourceMembership,
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        resourceOwnerUserId: space.ownerUserId,
        resourceSpaceId: entry.spaceId,
        visibility: entry.visibility,
      });

      const sharedComments = store.notes.filter((note) => {
        if (note.libraryEntryId !== input.libraryEntryId || note.visibility !== 'space_shared') {
          return false;
        }

        return canReadResource({
          actorHasResourceMembership,
          actorSpaceId: input.actorSpaceId,
          actorUserId: input.actorUserId,
          resourceOwnerUserId: note.authorUserId,
          resourceSpaceId: entry.spaceId,
          visibility: note.visibility,
        });
      });
      const workspace = await buildWorkspaceView(store, {
        actorUserId: input.actorUserId,
        libraryEntryId: input.libraryEntryId,
        sharedComments,
      });
      const privateNotes = (await store.notebookService.listNotes({
        libraryEntryId: input.libraryEntryId,
        ownerUserId: input.actorUserId,
      })).map((note) => toReadingNote(note, input.libraryEntryId));

      return {
        asset: {
          abstractText: asset.abstractText,
          canonicalId: asset.canonicalId,
          createdAt: asset.createdAt,
          id: asset.id,
          title: asset.title,
        },
        document: buildReadingDocument(asset),
        entry,
        insights: store.insights.filter(
          (insight) => insight.libraryEntryId === input.libraryEntryId,
        ),
        notes: [...privateNotes, ...sharedComments],
        retrieval: { ...documentReadyReadingRetrievalState },
        workspace,
      };
    },
    async getWorkbenchDetail(
      input: GetWorkbenchReadingDetailRequest,
    ): Promise<ReadingDetailView | null> {
      const entry = store.libraryEntries.find(
        (candidate) => candidate.id === input.libraryEntryId,
      );

      if (!entry) {
        return null;
      }

      const detail = await this.getDetail({
        actorSpaceId: entry.spaceId,
        actorUserId: input.actorUserId,
        libraryEntryId: input.libraryEntryId,
      });

      if (!detail) {
        return null;
      }

      return detail;
    },
    async createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      assertEntryAccess(store, input.authorUserId, input.actorSpaceId, input.libraryEntryId);

      const note: NoteRecord = {
        authorUserId: input.authorUserId,
        body: input.body,
        createdAt: new Date().toISOString(),
        id: store.nextId('note'),
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      };

      store.notes.push(note);
      store.persist();

      return note;
    },
    async createWorkbenchNote(
      input: CreateWorkbenchNoteRequest,
    ): Promise<NoteRecord> {
      if (input.visibility === 'private') {
        const note = await store.notebookService.createNote({
          libraryEntryId: input.libraryEntryId,
          ownerUserId: input.authorUserId,
          text: input.body,
        });

        return toReadingNote(note, input.libraryEntryId);
      }

      const { entry } = getLibraryContext(store, input.libraryEntryId);

      return this.createNote({
        actorSpaceId: entry.spaceId,
        authorUserId: input.authorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      });
    },
    async saveGeneratedInsight(
      input: SaveGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      assertEntryAccess(
        store,
        input.startedByUserId,
        input.actorSpaceId,
        input.libraryEntryId,
      );

      const { asset, entry } = getLibraryContext(store, input.libraryEntryId);
      const createdAt = new Date().toISOString();
      const conversation: ConversationRecord = {
        createdAt,
        id: store.nextId('conversation'),
        libraryEntryId: input.libraryEntryId,
        startedByUserId: input.startedByUserId,
        title: input.title,
      };

      store.conversations.push(conversation);

      const insight = store.evidenceLinkService.createGeneratedInsight({
        conversationId: conversation.id,
        createdAt,
        evidenceSpans: input.evidenceSpans,
        id: store.nextId('insight'),
        libraryEntryId: input.libraryEntryId,
        paperAssetId: asset.id,
        summary: input.summary,
      });

      store.insights.push(insight);
      createEvidenceCards(store, {
        evidenceSpans: input.evidenceSpans,
        paperAssetId: asset.id,
        scope: entry.visibility === 'private' ? 'private' : 'project',
      });
      store.persist();

      return insight;
    },
    async saveWorkbenchGeneratedInsight(
      input: SaveWorkbenchGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      const { entry } = getLibraryContext(store, input.libraryEntryId);

      return this.saveGeneratedInsight({
        actorSpaceId: entry.spaceId,
        evidenceSpans: input.evidenceSpans,
        libraryEntryId: input.libraryEntryId,
        startedByUserId: input.startedByUserId,
        summary: input.summary,
        title: input.title,
      });
    },
  };
}
