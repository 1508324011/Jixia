import { describe, expect, expectTypeOf, it } from 'vitest';

import * as jobs from '../../src/shared/contracts/jobs';
import * as library from '../../src/shared/contracts/library';
import * as documentContent from '../../src/shared/contracts/document-content';
import * as documentSnapshot from '../../src/shared/contracts/document-snapshot';
import * as homeCockpit from '../../src/shared/contracts/home-cockpit';
import * as notebook from '../../src/shared/contracts/notebook';
import * as projects from '../../src/shared/contracts/projects';
import * as projectDocs from '../../src/shared/contracts/project-docs';
import * as reading from '../../src/shared/contracts/reading';
import * as spaces from '../../src/shared/contracts/spaces';
import * as writing from '../../src/shared/contracts/writing';

import type {
  CreateSpaceRequest,
  MembershipQuery,
  SpaceKind,
  SpaceMembership,
  SpaceSummary,
} from '../../src/shared/contracts/spaces';
import type {
  AdoptProjectLibraryEntryRequest,
  AdoptProjectLibraryEntryResponse,
  ImportPaperAssetRequest,
  LibraryEntryRecord,
  LibraryEntryView,
  PaperAssetRecord,
} from '../../src/shared/contracts/library';
import type {
  CreateProjectRequest,
  ProjectListItem,
  ProjectMemberRecord,
  ProjectMemberRole,
  ProjectRecord,
  ProjectStatus,
  ProjectWorkspaceResponse,
  ScopeRef,
} from '../../src/shared/contracts/projects';
import type {
  ConversationRecord,
  CreateProjectReadingCommentRequest,
  CreateReadingNoteRequest,
  NoteRecord,
  PrivateReadingNoteRecord,
  ProjectReadingCommentRecord,
  ReadingDetailView,
  ReadingStateRecord,
} from '../../src/shared/contracts/reading';
import type {
  PublishState,
} from '../../src/shared/contracts/writing';
import type {
  DocumentCitationRecordBase,
  DocumentSnapshot,
} from '../../src/shared/contracts/document-snapshot';
import type {
  DocumentBlockDocument,
  DocumentContentPayload,
  DocumentSourceExcerptBlock,
} from '../../src/shared/contracts/document-content';
import type {
  HomeCockpitResponse,
  HomeCockpitSectionId,
  HomeCockpitSectionStatus,
  HomeCockpitWorkbenchContext,
} from '../../src/shared/contracts/home-cockpit';
import type {
  CaptureNotebookEvidenceRequest,
  CaptureNotebookEvidenceResponse,
  ListNotebookDocumentsResponse,
  NotebookCitationRecord,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
  NotebookSourceExcerptBlock,
} from '../../src/shared/contracts/notebook';
import type {
  ProjectDocCitationRecord,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '../../src/shared/contracts/project-docs';
import type {
  JobAuditRecord,
  CancelJobRequest,
  JobEventRecord,
  JobRecord,
  RunJobRequest,
  JobStatus,
  JobStatusQuery,
} from '../../src/shared/contracts/jobs';

describe('core contracts', () => {
  it('exports space payloads for creation and membership queries', () => {
    expect(spaces).toBeTruthy();

    const createSpaceRequest: CreateSpaceRequest = {
      name: 'Computational Biology',
      kind: 'personal',
      description: 'Server-first research collaboration space',
    };
    const membershipQuery: MembershipQuery = { spaceId: 'space_001' };
    const spaceSummary: SpaceSummary = {
      id: 'space_001',
      name: 'Computational Biology',
      kind: 'personal',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const membership: SpaceMembership = {
      spaceId: 'space_001',
      userId: 'user_001',
      role: 'owner',
      joinedAt: '2026-03-21T00:00:00.000Z',
    };

    expect(createSpaceRequest.name).toBe('Computational Biology');
    expect(membershipQuery.spaceId).toBe('space_001');
    expect(createSpaceRequest.kind).toBe('personal');
    expect(spaceSummary.kind).toBe('personal');
    expect(membership.role).toBe('owner');

    const createSpaceShape: {
      name: string;
      description?: string;
    } = createSpaceRequest;

    expect(createSpaceShape.name).toBe('Computational Biology');
    expectTypeOf<SpaceKind>().toEqualTypeOf<'personal' | 'shared'>();
  });

  it('exports project-first collaboration payloads and explicit scope refs', () => {
    expect(projects).toBeTruthy();

    const personalScope: ScopeRef = { type: 'user', id: 'user_001' };
    const projectScope: ScopeRef = { type: 'project', id: 'project_001' };
    const createProjectRequest: CreateProjectRequest = {
      name: 'Project-first recovery',
      spaceId: 'space_001',
      status: 'active',
    };
    const project: ProjectRecord = {
      createdAt: '2026-05-03T00:00:00.000Z',
      createdByUserId: 'user_001',
      id: 'project_001',
      name: 'Project-first recovery',
      spaceId: 'space_001',
      status: 'active',
      updatedAt: '2026-05-03T00:00:00.000Z',
    };
    const membership: ProjectMemberRecord = {
      joinedAt: '2026-05-03T00:00:00.000Z',
      projectId: project.id,
      role: 'owner',
      userId: 'user_001',
    };
    const listItem: ProjectListItem = { membership, project };
    const workspace: ProjectWorkspaceResponse = {
      actor: {
        role: 'owner',
        userId: 'user_001',
      },
      contract: projects.projectsContract,
      docs: {
        documents: [
          {
            createdAt: '2026-05-03T00:00:00.000Z',
            createdByUserId: 'user_001',
            documentId: 'project-doc_001',
            latestVersion: {
              capturedAt: '2026-05-03T00:10:00.000Z',
              versionId: 'project-doc-version_001',
              versionNumber: 1,
            },
            openHref: '/projects/project_001/writing/project-doc_001',
            projectId: project.id,
            publishState: 'draft',
            title: 'Shared synthesis',
            updatedAt: '2026-05-03T00:10:00.000Z',
          },
        ],
        emptyState: {
          body: 'No Project Docs have been created yet.',
          title: 'No Project Docs yet',
        },
        projectId: project.id,
        totalCount: 1,
      },
      generatedAt: '2026-05-03T00:11:00.000Z',
      links: {
        libraryHref: '/projects/project_001/library',
        projectHref: '/projects/project_001',
        writerHref: '/projects/project_001/writing/project-doc_001',
      },
      membership,
      project,
    };

    expect(personalScope.type).toBe('user');
    expect(projectScope.type).toBe('project');
    expect(createProjectRequest.spaceId).toBe('space_001');
    expect(listItem.membership.role).toBe('owner');
    expect(workspace.contract).toBe(projects.projectsContract);
    expect(workspace.actor.userId).toBe('user_001');
    expect(workspace.docs.totalCount).toBe(1);
    expect(workspace.links.libraryHref).toBe('/projects/project_001/library');
    expect(workspace.docs.documents[0]?.openHref).toBe('/projects/project_001/writing/project-doc_001');
    expect(workspace.docs.documents[0]?.latestVersion?.versionNumber).toBe(1);
    expect(projects.projectsContract).toBe('jixia-projects-contract');

    expectTypeOf<ProjectStatus>().toEqualTypeOf<'active' | 'archived'>();
    expectTypeOf<ProjectMemberRole>().toEqualTypeOf<
      'owner' | 'editor' | 'viewer'
    >();
  });

  it('exports the server-owned Home cockpit read-model contract', () => {
    expect(homeCockpit.homeCockpitContract).toBe('jixia-home-cockpit-contract');

    const workbench: HomeCockpitWorkbenchContext = {
      label: 'Personal workbench',
      route: '/home',
      scope: { id: 'user_001', type: 'user' },
    };
    const response: HomeCockpitResponse = {
      actor: {
        displayName: 'Alice',
        email: 'alice@example.test',
        id: 'user_001',
      },
      contract: homeCockpit.homeCockpitContract,
      generatedAt: '2026-05-17T00:00:00.000Z',
      nextActions: [
        {
          description: 'Open the governed jobs surface.',
          id: 'open-jobs',
          label: 'Open Jobs',
          priority: 'primary',
          to: '/jobs',
        },
      ],
      notices: [
        {
          body: 'Built from a session-derived server actor.',
          id: 'server-owned-read-model',
          title: 'Server-owned cockpit',
          tone: 'info',
        },
      ],
      recentActivity: [
        {
          context: 'ai.summary · queued',
          href: '/jobs',
          id: 'job:job_001',
          kind: 'job',
          occurredAt: '2026-05-17T00:00:00.000Z',
          title: 'job_001',
        },
      ],
      sections: [
        {
          description: 'Visible projects and spaces.',
          id: 'collaboration',
          metrics: [{ label: 'Visible projects', value: 1 }],
          primaryAction: {
            description: 'Review visible project workspaces.',
            id: 'open-projects',
            label: 'Open Projects',
            priority: 'primary',
            to: '/projects',
          },
          status: 'active',
          title: 'Collaboration cockpit',
        },
      ],
      workbench,
    };

    expect(response.contract).toBe(homeCockpit.homeCockpitContract);
    expect(response.workbench.route).toBe('/home');
    expect(response.workbench.scope).toEqual({ id: 'user_001', type: 'user' });
    expect(response.sections[0]?.id).toBe('collaboration');
    expect(response.recentActivity[0]?.kind).toBe('job');

    expectTypeOf<HomeCockpitWorkbenchContext['scope']>().toEqualTypeOf<ScopeRef>();
    expectTypeOf<HomeCockpitSectionId>().toEqualTypeOf<
      'collaboration' | 'library' | 'writing' | 'jobs'
    >();
    expectTypeOf<HomeCockpitSectionStatus>().toEqualTypeOf<
      'empty' | 'active' | 'attention'
    >();
  });

  it('exports asset import and library entry payloads', () => {
    expect(library).toBeTruthy();

    const importRequest: ImportPaperAssetRequest = {
      sourceType: 'doi',
      sourceLocator: '10.1000/j.jixia.2026.01',
      requestedByUserId: 'user_001',
    };
    const asset: PaperAssetRecord = {
      id: 'asset_001',
      canonicalId: 'doi:10.1000/j.jixia.2026.01',
      title: 'Jixia as a server-first research platform',
      abstractText: 'A platform bootstrap paper.',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const entry: LibraryEntryRecord = {
      addedByUserId: 'user_001',
      id: 'entry_001',
      scope: { type: 'user', id: 'user_001' },
      scopeType: 'user',
      scopeId: 'user_001',
      spaceId: '',
      paperAssetId: 'asset_001',
      visibility: 'private',
      createdAt: '2026-03-21T00:00:00.000Z',
      addedAt: '2026-03-21T00:00:00.000Z',
    };
    const entryView: LibraryEntryView = {
      entry,
      asset,
    };
    const adoptionRequest: AdoptProjectLibraryEntryRequest = {
      sourceLibraryEntryId: entry.id,
    };
    const adoptionResponse: AdoptProjectLibraryEntryResponse = {
      entry: entryView,
      reused: false,
    };

    expect(importRequest.sourceType).toBe('doi');
    expect(entryView.entry.paperAssetId).toBe('asset_001');
    expect(entryView.entry.scope).toEqual({ type: 'user', id: 'user_001' });
    expect(entryView.entry.spaceId).toBe('');
    expect(entryView.entry.visibility).toBe('private');
    expect(adoptionRequest.sourceLibraryEntryId).toBe('entry_001');
    expect(adoptionResponse.entry).toBe(entryView);
    expect(adoptionResponse.reused).toBe(false);

    const libraryEntryShape: {
      entry: LibraryEntryRecord;
      asset: PaperAssetRecord;
    } = entryView;

    expect(libraryEntryShape.asset.id).toBe('asset_001');
  });

  it('exports reading payloads for private notes, project comments, and conversations', () => {
    expect(reading).toBeTruthy();

    const note: NoteRecord = {
      id: 'note_001',
      kind: 'private_note',
      libraryEntryId: 'entry_001',
      authorUserId: 'user_001',
      visibility: 'private',
      body: 'Key finding with evidence link',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const privateNote: PrivateReadingNoteRecord = {
      id: 'private_note_001',
      kind: 'private_note',
      libraryEntryId: 'entry_001',
      authorUserId: 'user_001',
      body: 'Owner-only note with no visibility authority.',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const projectComment: ProjectReadingCommentRecord = {
      id: 'comment_001',
      kind: 'project_comment',
      libraryEntryId: 'entry_001',
      projectId: 'project_001',
      authorUserId: 'user_001',
      body: 'Project-scoped comment visible through ProjectMember authority.',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const conversation: ConversationRecord = {
      id: 'conv_001',
      libraryEntryId: 'entry_001',
      startedByUserId: 'user_001',
      title: 'Summarize the introduction',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const readingState: ReadingStateRecord = {
      libraryEntryId: 'entry_001',
      userId: 'user_001',
      progressPercent: 40,
      lastReadAt: '2026-03-21T00:00:00.000Z',
    };
    const createNoteRequest: CreateReadingNoteRequest = {
      body: 'Private note body',
      libraryEntryId: 'entry_001',
    };
    const createProjectCommentRequest: CreateProjectReadingCommentRequest = {
      body: 'Project comment body',
      libraryEntryId: 'entry_001',
      projectId: 'project_001',
    };
    const readingDetail: ReadingDetailView = {
      asset: {
        id: 'asset_001',
        canonicalId: 'doi:10.1000/j.jixia.2026.01',
        title: 'Jixia as a server-first research platform',
        createdAt: '2026-03-21T00:00:00.000Z',
      },
      entry: {
        addedAt: '2026-03-21T00:00:00.000Z',
        addedByUserId: 'user_001',
        createdAt: '2026-03-21T00:00:00.000Z',
        id: 'entry_001',
        paperAssetId: 'asset_001',
        scope: { id: 'project_001', type: 'project' },
        scopeId: 'project_001',
        scopeType: 'project',
        spaceId: 'space_001',
        visibility: 'published_to_project',
      },
      insights: [],
      notes: [privateNote],
      projectComments: [projectComment],
    };

    expect(note.visibility).toBe('private');
    expect(privateNote.kind).toBe('private_note');
    expect(projectComment.projectId).toBe('project_001');
    expect(projectComment.kind).toBe('project_comment');
    expect(createNoteRequest).not.toHaveProperty('visibility');
    expect(createProjectCommentRequest.projectId).toBe('project_001');
    expect(readingDetail.notes).toHaveLength(1);
    expect(readingDetail.projectComments).toHaveLength(1);
    expect(conversation.title).toContain('Summarize');
    expect(readingState.progressPercent).toBe(40);
  });

  it('exports versioned document content payloads and legacy projection helpers', () => {
    expect(documentContent.documentContentContract).toBe(
      'jixia-document-content-contract',
    );
    expect(documentContent.DOCUMENT_BLOCK_SCHEMA_VERSION).toBe(1);
    expect(documentContent.DOCUMENT_BLOCK_SNAPSHOT_FORMAT).toBe(
      'jixia-document-blocks-v1',
    );

    const legacyDocument = documentContent.legacyTextToDocumentBlockDocument(
      'Legacy textarea content',
    );
    const emptyLegacyDocument = documentContent.legacyTextToDocumentBlockDocument('');

    expect(legacyDocument).toEqual({
      blocks: [
        {
          text: 'Legacy textarea content',
          type: 'paragraph',
        },
      ],
      schemaVersion: 1,
    });
    expect(emptyLegacyDocument).toEqual({ blocks: [], schemaVersion: 1 });
    expect(documentContent.documentBlockDocumentToLegacyText(legacyDocument)).toBe(
      'Legacy textarea content',
    );
    expect(
      documentContent.documentBlockDocumentToLegacyText(emptyLegacyDocument),
    ).toBe('');

    const sourceExcerpt: DocumentSourceExcerptBlock = {
      locator: 'p. 4',
      note: 'Use this as supporting evidence.',
      paperAssetId: 'asset_001',
      quote: 'source-backed quote',
      title: 'Jixia as a server-first research platform',
      type: 'sourceExcerpt',
    };
    const structuredDocument: DocumentContentPayload = {
      blocks: [
        {
          level: 2,
          text: 'Findings',
          type: 'heading',
        },
        {
          label: 'Smith 2026',
          locator: 'p. 4',
          paperAssetId: 'asset_001',
          type: 'citation',
        },
        sourceExcerpt,
      ],
      schemaVersion: 1,
    };
    const normalizedStructuredDocument =
      documentContent.normalizeDocumentBlockDocument(structuredDocument);
    const serializedStructuredDocument =
      documentContent.serializeDocumentBlockSnapshotPayload(structuredDocument);

    expect(
      documentContent.documentBlockDocumentToLegacyText(structuredDocument),
    ).toBe(
      [
        '## Findings',
        '[Citation: Smith 2026 — p. 4]',
        '> source-backed quote\n\nSource: Jixia as a server-first research platform (p. 4)\nCapture note: Use this as supporting evidence.',
      ].join('\n\n'),
    );
    expect(
      documentContent.normalizePersistedDocumentSnapshot('Plain legacy row'),
    ).toEqual({
      blocks: [
        {
          text: 'Plain legacy row',
          type: 'paragraph',
        },
      ],
      schemaVersion: 1,
    });
    expect(
      documentContent.normalizePersistedDocumentSnapshot(
        serializedStructuredDocument,
      ),
    ).toEqual(normalizedStructuredDocument);
    expect(
      documentContent.extractDocumentBlockReferences(structuredDocument),
    ).toMatchObject([
      {
        paperAssetId: 'asset_001',
        sourceType: 'citation',
      },
      {
        paperAssetId: 'asset_001',
        sourceType: 'sourceExcerpt',
      },
    ]);
    expect(
      documentContent.extractDocumentBlockReferences({
        blocks: [
          {
            evidenceSpan: 'quoted evidence',
            libraryEntryId: 'entry_001',
            paperAssetId: 'asset_001',
            text: 'quoted evidence',
            type: 'quote',
          },
          {
            evidenceSpan: 'suggested evidence',
            libraryEntryId: 'entry_001',
            paperAssetId: 'asset_001',
            status: 'proposed',
            text: 'Use this supporting point.',
            type: 'aiSuggestion',
          },
        ],
        schemaVersion: 1,
      }),
    ).toEqual([
      {
        evidenceSpan: 'quoted evidence',
        libraryEntryId: 'entry_001',
        paperAssetId: 'asset_001',
        sourceType: 'quote',
      },
      {
        evidenceSpan: 'suggested evidence',
        libraryEntryId: 'entry_001',
        paperAssetId: 'asset_001',
        sourceType: 'aiSuggestion',
      },
    ]);
    expect(() =>
      documentContent.normalizeDocumentBlockDocument({
        blocks: [{ text: 'x', type: 'paragraph', projectId: 'project_001' }],
        schemaVersion: 1,
      }),
    ).toThrow(/projectId/);
    expect(() =>
      documentContent.normalizeDocumentBlockDocument({
        blocks: [{ text: 'x', type: 'paragraph', scope: { id: 'project_001', type: 'project' } }],
        schemaVersion: 1,
      }),
    ).toThrow(/scope/);
    expect(() =>
      documentContent.normalizeDocumentBlockDocument({
        blocks: [],
        ownerId: 'user_001',
        schemaVersion: 1,
      }),
    ).toThrow(/ownerId/);
    expect(() =>
      documentContent.normalizeDocumentBlockDocument({
        blocks: [
          {
            libraryEntryId: 'entry_001',
            text: 'quote with incomplete source metadata',
            type: 'quote',
          },
        ],
        schemaVersion: 1,
      }),
    ).toThrow(/paperAssetId is required/);
    expect(() =>
      documentContent.normalizeDocumentBlockDocument({
        blocks: [
          {
            libraryEntryId: 'entry_001',
            status: 'proposed',
            text: 'suggestion with incomplete source metadata',
            type: 'aiSuggestion',
          },
        ],
        schemaVersion: 1,
      }),
    ).toThrow(/paperAssetId is required/);
    const malformedPersistedEnvelope = JSON.stringify({
      document: {
        blocks: [{ text: 'bad persisted block', type: 'unsupported' }],
        schemaVersion: 1,
      },
      format: documentContent.DOCUMENT_BLOCK_SNAPSHOT_FORMAT,
    });

    expect(
      documentContent.normalizePersistedDocumentSnapshot(malformedPersistedEnvelope),
    ).toEqual({
      blocks: [
        {
          text: malformedPersistedEnvelope,
          type: 'paragraph',
        },
      ],
      schemaVersion: 1,
    });
    expect(() =>
      documentContent.normalizeDocumentBlockDocument({
        blocks: [{ text: 'x', type: 'unsupported' }],
        schemaVersion: 1,
      }),
    ).toThrow(/supported Jixia document block type/);

    expectTypeOf<DocumentContentPayload>().toMatchTypeOf<{
      blocks: unknown[];
      schemaVersion: 1;
    }>();
    expectTypeOf<DocumentSourceExcerptBlock>().toMatchTypeOf<{
      paperAssetId: string;
      quote: string;
      type: 'sourceExcerpt';
    }>();
  });

  it('exports explicit notebook and project-doc writing payloads', () => {
    expect(documentSnapshot).toBeTruthy();
    expect(writing).toBeTruthy();
    expect(notebook).toBeTruthy();
    expect(projectDocs).toBeTruthy();

    const notebookDoc: NotebookDocumentRecord = {
      createdAt: '2026-03-21T00:00:00.000Z',
      id: 'notebook_001',
      ownerId: 'user_001',
      title: 'Private notebook draft',
      updatedAt: '2026-03-21T00:00:00.000Z',
    };
    const notebookCitation: NotebookCitationRecord = {
      createdAt: '2026-03-21T00:00:00.000Z',
      evidenceSpan: 'p. 4',
      id: 'notebook_citation_001',
      notebookDocumentVersionId: 'notebook_version_001',
      paperAssetId: 'asset_001',
    };
    const notebookSnapshot: NotebookDocumentSnapshot = {
      capturedAt: '2026-03-21T00:00:00.000Z',
      citations: [notebookCitation],
      content: '# Notebook Draft',
      document: notebookDoc,
      documentContent: {
        blocks: [
          {
            text: '# Notebook Draft',
            type: 'paragraph',
          },
        ],
        schemaVersion: 1,
      },
      versionId: 'notebook_version_001',
      versionNumber: 1,
    };
    const notebookList: ListNotebookDocumentsResponse = {
      documents: [notebookDoc],
    };
    const sourceExcerpt: NotebookSourceExcerptBlock = {
      capturedAt: '2026-03-21T00:00:00.000Z',
      libraryEntryId: 'entry_001',
      locator: 'offsets 0-12',
      note: 'Private interpretation stays editable outside the quote.',
      paperAssetId: 'asset_001',
      quote: 'source-backed quote',
      title: 'Jixia as a server-first research platform',
      type: 'sourceExcerpt',
    };
    const captureRequest: CaptureNotebookEvidenceRequest = {
      notebookDocumentId: notebookDoc.id,
      source: {
        generatedInsightId: 'insight_001',
        libraryEntryId: 'entry_001',
        note: 'Capture this for private synthesis.',
        type: 'generatedInsight',
      },
    };
    const captureResponse: CaptureNotebookEvidenceResponse = {
      document: notebookDoc,
      snapshot: notebookSnapshot,
    };

    const projectDoc: ProjectDocRecord = {
      createdAt: '2026-03-21T00:00:00.000Z',
      createdByUserId: 'user_001',
      id: 'project_doc_001',
      projectId: 'project_001',
      publishState: 'draft',
      title: 'Shared project draft',
      updatedAt: '2026-03-21T00:00:00.000Z',
    };
    const projectDocCitation: ProjectDocCitationRecord = {
      createdAt: '2026-03-21T00:00:00.000Z',
      evidenceSpan: 'fig. 2',
      id: 'project_doc_citation_001',
      paperAssetId: 'asset_001',
      projectDocVersionId: 'project_doc_version_001',
    };
    const projectDocSnapshot: ProjectDocSnapshot = {
      capturedAt: '2026-03-21T00:00:00.000Z',
      citations: [projectDocCitation],
      content: '# Shared Draft',
      document: projectDoc,
      documentContent: {
        blocks: [
          {
            level: 1,
            text: 'Shared Draft',
            type: 'heading',
          },
        ],
        schemaVersion: 1,
      },
      versionId: 'project_doc_version_001',
      versionNumber: 2,
    };

    expect(notebookSnapshot.document.ownerId).toBe('user_001');
    expect(notebookSnapshot.citations[0]?.evidenceSpan).toBe('p. 4');
    expect(notebookSnapshot.documentContent?.schemaVersion).toBe(1);
    expect(notebookList.documents).toHaveLength(1);
    expect(sourceExcerpt.type).toBe('sourceExcerpt');
    expect(captureRequest.source.type).toBe('generatedInsight');
    expect(captureResponse.snapshot.document.id).toBe(notebookDoc.id);
    expect(projectDocSnapshot.document.publishState).toBe('draft');
    expect(projectDocSnapshot.documentContent?.schemaVersion).toBe(1);
    expect(projectDocSnapshot.citations[0]?.projectDocVersionId).toBe(
      'project_doc_version_001',
    );
    expect(notebook.notebookContract).toBe('jixia-notebook-contract');
    expect(projectDocs.projectDocsContract).toBe('jixia-project-docs-contract');
    expect(documentSnapshot.documentSnapshotContract).toBe(
      'jixia-document-snapshot-contract',
    );

    expectTypeOf<PublishState>().toEqualTypeOf<
      'draft' | 'review' | 'published'
    >();
    expectTypeOf<NotebookCitationRecord>().toMatchTypeOf<DocumentCitationRecordBase>();
    expectTypeOf<ProjectDocCitationRecord>().toMatchTypeOf<DocumentCitationRecordBase>();
    expectTypeOf<NotebookDocumentSnapshot>().toEqualTypeOf<
      DocumentSnapshot<NotebookDocumentRecord, NotebookCitationRecord>
    >();
    expectTypeOf<ProjectDocSnapshot>().toEqualTypeOf<
      DocumentSnapshot<ProjectDocRecord, ProjectDocCitationRecord>
    >();
    expectTypeOf<DocumentBlockDocument>().toMatchTypeOf<{
      blocks: unknown[];
      schemaVersion: 1;
    }>();
  });

  it('exports job payloads for status queries, events, and audits', () => {
    expect(jobs).toBeTruthy();

    const statusQuery: JobStatusQuery = { jobId: 'job_001' };
    const runRequest: RunJobRequest = { jobId: 'job_001' };
    const cancelRequest: CancelJobRequest = { jobId: 'job_001' };
    const status: JobStatus = 'running';
    const job: JobRecord = {
      id: 'job_001',
      kind: 'reading_summary',
      status,
      credentialRef: 'cred_001',
      createdAt: '2026-03-21T00:00:00.000Z',
      scope: { id: 'user_001', type: 'user' },
      scopeType: 'user',
      scopeId: 'user_001',
      spaceId: 'space_001',
    };
    const event: JobEventRecord = {
      id: 'event_001',
      jobId: 'job_001',
      status,
      message: 'Summarization started',
      recordedAt: '2026-03-21T00:00:00.000Z',
    };
    const audit: JobAuditRecord = {
      action: 'job.created',
      actorUserId: 'user_001',
      detail: 'Created reading_summary with credential cred_001.',
      id: 'audit_001',
      jobId: 'job_001',
      recordedAt: '2026-03-21T00:00:00.000Z',
      spaceId: 'space_001',
    };

    expect(statusQuery.jobId).toBe('job_001');
    expect(runRequest.jobId).toBe('job_001');
    expect(cancelRequest.jobId).toBe('job_001');
    expect(job.status).toBe('running');
    expect(event.message).toContain('started');
    expect(audit.action).toBe('job.created');
    expect(audit.actorUserId).toBe('user_001');
    expect(jobs.jobsContract).toBe('jixia-jobs-contract');

    expectTypeOf<JobStatus>().toEqualTypeOf<
      'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    >();
  });
});
