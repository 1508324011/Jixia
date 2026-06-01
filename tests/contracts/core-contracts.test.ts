import { describe, expect, expectTypeOf, it } from 'vitest';

import * as commandSearch from '../../src/shared/contracts/command-search';
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
  CommandSearchObjectKind,
  CommandSearchResponse,
  CommandSearchResult,
  CommandSearchResultScope,
} from '../../src/shared/contracts/command-search';
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
  ProjectWorkspaceActivityKind,
  ProjectWorkspaceResourceKind,
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
  CreateReaderExcerptRequest,
  CreateReadingNoteRequest,
  NoteRecord,
  PrivateReadingNoteRecord,
  ProjectReadingCommentRecord,
  ReaderExcerptRecord,
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
  AdoptNotebookIntoProjectDocRequest,
  AdoptNotebookIntoProjectDocResponse,
  ProjectDocCitationRecord,
  ProjectDocCitationTraceResponse,
  ProjectDocNotebookAdoptionProvenance,
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
      activity: {
        emptyState: {
          body: 'Project activity will appear when Project Docs, project Library entries, Reader comments or excerpts, and governed project jobs change.',
          title: 'No project activity yet',
        },
        items: [
          {
            href: '/projects/project_001/writing/project-doc_001',
            id: 'project-doc:project-doc_001',
            kind: 'project-doc',
            occurredAt: '2026-05-03T00:10:00.000Z',
            projectId: project.id,
            sourceId: 'project-doc_001',
            sourceLabel: 'Project Doc',
            summary: 'Project Doc draft · version 1',
            title: 'Shared synthesis',
          },
          {
            href: '/projects/project_001/library/entry_001/reader',
            id: 'library-entry:entry_001',
            kind: 'library-entry',
            occurredAt: '2026-05-03T00:09:00.000Z',
            projectId: project.id,
            sourceId: 'entry_001',
            sourceLabel: 'Project Library',
            summary: 'Project Library · doi:10.1000/j.jixia.2026.01',
            title: 'Shared synthesis source',
          },
          {
            href: '/projects/project_001/library/entry_001/reader',
            id: 'reader-comment:comment_001',
            kind: 'reader-comment',
            occurredAt: '2026-05-03T00:08:30.000Z',
            projectId: project.id,
            sourceId: 'comment_001',
            sourceLabel: 'Reader comment',
            summary: 'Project comment · Shared synthesis source',
            title: 'Shared project comment',
          },
          {
            href: '/projects/project_001/library/entry_001/reader',
            id: 'reader-excerpt:excerpt_001',
            kind: 'reader-excerpt',
            occurredAt: '2026-05-03T00:08:00.000Z',
            projectId: project.id,
            sourceId: 'excerpt_001',
            sourceLabel: 'Reader excerpt',
            summary: 'Reader excerpt · Shared synthesis source · loc-1',
            title: 'Evidence quote',
          },
          {
            href: '/jobs?scopeType=project&scopeId=project_001&jobId=job_001',
            id: 'job:job_001',
            kind: 'job',
            occurredAt: '2026-05-03T00:07:00.000Z',
            projectId: project.id,
            sourceId: 'job_001',
            sourceLabel: 'Project job',
            summary: 'Job status · queued',
            title: 'ai.summary',
          },
        ],
        projectId: project.id,
        totalCount: 5,
      },
      actor: {
        role: 'owner',
        userId: 'user_001',
      },
      contract: projects.projectsContract,
      docs: {
        canCreate: true,
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
      resources: {
        emptyState: {
          body: 'Project resources will appear when Project Docs, project Library entries, Reader excerpts, or governed jobs exist.',
          title: 'No project resources yet',
        },
        items: [
          {
            href: '/projects/project_001/writing/project-doc_001',
            id: 'project-doc:project-doc_001',
            kind: 'project-doc',
            projectId: project.id,
            sourceId: 'project-doc_001',
            subtitle: 'draft · version 1',
            title: 'Shared synthesis',
            updatedAt: '2026-05-03T00:10:00.000Z',
          },
          {
            href: '/projects/project_001/library/entry_001/reader',
            id: 'library-entry:entry_001',
            kind: 'library-entry',
            projectId: project.id,
            sourceId: 'entry_001',
            subtitle: 'Project Library · doi:10.1000/j.jixia.2026.01',
            title: 'Shared synthesis source',
            updatedAt: '2026-05-03T00:09:00.000Z',
          },
          {
            href: '/projects/project_001/library/entry_001/reader',
            id: 'reader-excerpt:excerpt_001',
            kind: 'reader-excerpt',
            projectId: project.id,
            sourceId: 'excerpt_001',
            subtitle: 'Reader excerpt · Shared synthesis source · loc-1',
            title: 'Evidence quote',
            updatedAt: '2026-05-03T00:08:00.000Z',
          },
          {
            href: '/jobs?scopeType=project&scopeId=project_001&jobId=job_001',
            id: 'job:job_001',
            kind: 'job',
            projectId: project.id,
            sourceId: 'job_001',
            subtitle: 'Project job · queued',
            title: 'ai.summary',
            updatedAt: '2026-05-03T00:07:00.000Z',
          },
        ],
        projectId: project.id,
        totalCount: 4,
      },
    };

    expect(personalScope.type).toBe('user');
    expect(projectScope.type).toBe('project');
    expect(createProjectRequest.spaceId).toBe('space_001');
    expect(listItem.membership.role).toBe('owner');
    expect(workspace.contract).toBe(projects.projectsContract);
    expect(workspace.actor.userId).toBe('user_001');
    expect(workspace.docs.totalCount).toBe(1);
    expect(workspace.activity.items[0]?.kind).toBe('project-doc');
    expect(workspace.activity.items[0]?.href).toBe('/projects/project_001/writing/project-doc_001');
    expect(workspace.activity.items[0]).not.toHaveProperty('actorUserId');
    expect(workspace.resources.items[0]?.title).toBe('Shared synthesis');
    expect(workspace.links.libraryHref).toBe('/projects/project_001/library');
    expect(workspace.docs.documents[0]?.openHref).toBe('/projects/project_001/writing/project-doc_001');
    expect(workspace.docs.documents[0]?.latestVersion?.versionNumber).toBe(1);
    expect(projects.projectsContract).toBe('jixia-projects-contract');

    expectTypeOf<ProjectStatus>().toEqualTypeOf<'active' | 'archived'>();
    expectTypeOf<ProjectMemberRole>().toEqualTypeOf<
      'owner' | 'editor' | 'viewer'
    >();
    expectTypeOf<ProjectWorkspaceActivityKind>().toEqualTypeOf<
      'project-doc' | 'library-entry' | 'reader-comment' | 'reader-excerpt' | 'job'
    >();
    expectTypeOf<ProjectWorkspaceResourceKind>().toEqualTypeOf<
      'project-doc' | 'library-entry' | 'reader-excerpt' | 'job'
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
      hasFile: false,
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
    };
    const createExcerptRequest: CreateReaderExcerptRequest = {
      endOffset: 32,
      locator: 'p. 4',
      note: 'Durable evidence note.',
      quote: 'durable quoted reader evidence',
      startOffset: 4,
    };
    const excerpt: ReaderExcerptRecord = {
      createdAt: '2026-03-21T00:00:00.000Z',
      createdByUserId: 'user_001',
      endOffset: 32,
      id: 'excerpt_001',
      libraryEntryId: 'entry_001',
      locator: 'p. 4',
      note: 'Durable evidence note.',
      paperAssetId: 'asset_001',
      quote: 'durable quoted reader evidence',
      startOffset: 4,
      updatedAt: '2026-03-21T00:00:00.000Z',
    };
    const readingDetail: ReadingDetailView = {
      asset: {
        id: 'asset_001',
        canonicalId: 'doi:10.1000/j.jixia.2026.01',
        hasFile: true,
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
      excerpts: [excerpt],
      insights: [],
      notes: [privateNote],
      projectComments: [projectComment],
    };

    expect(note.visibility).toBe('private');
    expect(privateNote.kind).toBe('private_note');
    expect(projectComment.projectId).toBe('project_001');
    expect(projectComment.kind).toBe('project_comment');
    expect(createExcerptRequest).toEqual({
      endOffset: 32,
      locator: 'p. 4',
      note: 'Durable evidence note.',
      quote: 'durable quoted reader evidence',
      startOffset: 4,
    });
    expect(createExcerptRequest).not.toHaveProperty('actorUserId');
    expect(createExcerptRequest).not.toHaveProperty('scope');
    expect(excerpt).not.toHaveProperty('visibility');
    expect(excerpt).not.toHaveProperty('spaceId');
    expect(excerpt).not.toHaveProperty('projectId');
    expect(createNoteRequest).not.toHaveProperty('visibility');
    expect(createProjectCommentRequest).not.toHaveProperty('projectId');
    expect(createProjectCommentRequest).not.toHaveProperty('visibility');
    expect(createProjectCommentRequest).not.toHaveProperty('spaceId');
    expect(createProjectCommentRequest).not.toHaveProperty('scope');
    expect(readingDetail.excerpts[0]?.paperAssetId).toBe('asset_001');
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
            readerExcerptId: 'excerpt_001',
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
        readerExcerptId: 'excerpt_001',
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
            readerExcerptId: 'excerpt_001',
            text: 'quote with excerpt but no asset metadata',
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
      readerExcerptId: 'excerpt_001',
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
      evidenceSpan: 'source-backed quote',
      libraryEntryId: 'entry_001',
      locator: 'offsets 0-12',
      note: 'Private interpretation stays editable outside the quote.',
      paperAssetId: 'asset_001',
      quote: 'source-backed quote',
      readerExcerptId: 'excerpt_001',
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
    const readerExcerptCaptureRequest: CaptureNotebookEvidenceRequest = {
      notebookTitle: 'Reader evidence notebook',
      source: {
        libraryEntryId: 'entry_001',
        note: 'Capture this reader-selected evidence for private synthesis.',
        readerExcerptId: 'excerpt_001',
        type: 'readerExcerpt',
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
      readerExcerptId: 'excerpt_001',
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
    const citationTrace: ProjectDocCitationTraceResponse = {
      capturedAt: projectDocSnapshot.capturedAt,
      citations: [
        {
          citationId: projectDocCitation.id,
          createdAt: projectDocCitation.createdAt,
          evidenceSpan: 'fig. 2',
          paper: {
            canonicalId: 'doi:10.1000/j.jixia.2026.01',
            createdAt: '2026-03-21T00:00:00.000Z',
            hasFile: true,
            id: 'asset_001',
            title: 'Jixia as a server-first research platform',
          },
          paperAssetId: 'asset_001',
          projectDocVersionId: 'project_doc_version_001',
          projectLibraryEntry: {
            libraryEntryId: 'entry_project_001',
            projectId: 'project_001',
          },
          readerExcerpt: {
            endOffset: 32,
            evidenceSpan: 'fig. 2',
            id: 'excerpt_001',
            locator: 'Figure 2',
            quote: 'source-backed quote',
            source: 'reader_source',
            sourceLibraryEntryId: 'entry_project_001',
            startOffset: 4,
          },
          readerExcerptId: 'excerpt_001',
          source: { state: 'available' },
        },
      ],
      document: projectDoc,
      generatedAt: '2026-03-21T00:01:00.000Z',
      versionId: projectDocSnapshot.versionId,
      versionNumber: projectDocSnapshot.versionNumber,
    };
    const unavailableTrace: ProjectDocCitationTraceResponse = {
      ...citationTrace,
      citations: [
        {
          citationId: 'project_doc_citation_002',
          createdAt: '2026-03-21T00:00:00.000Z',
          evidenceSpan: 'adoption-needed quote',
          paperAssetId: 'asset_private_001',
          projectDocVersionId: 'project_doc_version_001',
          source: {
            code: projectDocs.PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
            details: {
              evidenceSpan: 'adoption-needed quote',
              paperAssetId: 'asset_private_001',
              projectId: projectDoc.projectId,
              readerExcerptId: 'excerpt_private_001',
            },
            message: 'Paper asset asset_private_001 is not available in project project_001.',
            state: 'adoption_needed',
          },
        },
      ],
    };
    const notebookAdoptionRequest: AdoptNotebookIntoProjectDocRequest = {
      notebookDocumentId: notebookDoc.id,
    };
    const notebookAdoptionProvenance: ProjectDocNotebookAdoptionProvenance = {
      paperAssetIds: ['asset_001'],
      projectDocId: projectDoc.id,
      projectDocVersionId: projectDocSnapshot.versionId,
      projectDocVersionNumber: projectDocSnapshot.versionNumber,
      projectId: projectDoc.projectId,
      projectLibraryEntryIds: ['entry_project_001'],
      readerExcerptIds: ['excerpt_001'],
      sourceNotebookCapturedAt: notebookSnapshot.capturedAt,
      sourceNotebookDocumentId: notebookDoc.id,
      sourceNotebookVersionId: notebookSnapshot.versionId,
      sourceNotebookVersionNumber: notebookSnapshot.versionNumber,
    };
    const notebookAdoptionResponse: AdoptNotebookIntoProjectDocResponse = {
      citationTrace,
      provenance: notebookAdoptionProvenance,
      snapshot: projectDocSnapshot,
    };

    expect(notebookSnapshot.document.ownerId).toBe('user_001');
    expect(notebookSnapshot.citations[0]?.evidenceSpan).toBe('p. 4');
    expect(notebookSnapshot.citations[0]?.readerExcerptId).toBe('excerpt_001');
    expect(notebookSnapshot.documentContent?.schemaVersion).toBe(1);
    expect(notebookList.documents).toHaveLength(1);
    expect(sourceExcerpt.type).toBe('sourceExcerpt');
    expect(sourceExcerpt.readerExcerptId).toBe('excerpt_001');
    expect(sourceExcerpt.evidenceSpan).toBe('source-backed quote');
    expect(captureRequest.source.type).toBe('generatedInsight');
    expect(readerExcerptCaptureRequest.source.type).toBe('readerExcerpt');
    expect(readerExcerptCaptureRequest.source).not.toHaveProperty('ownerId');
    expect(readerExcerptCaptureRequest.source).not.toHaveProperty('projectId');
    expect(readerExcerptCaptureRequest.source).not.toHaveProperty('visibility');
    expect(captureResponse.snapshot.document.id).toBe(notebookDoc.id);
    expect(projectDocSnapshot.document.publishState).toBe('draft');
    expect(projectDocSnapshot.documentContent?.schemaVersion).toBe(1);
    expect(projectDocSnapshot.citations[0]?.projectDocVersionId).toBe(
      'project_doc_version_001',
    );
    expect(projectDocSnapshot.citations[0]?.readerExcerptId).toBe('excerpt_001');
    expect(citationTrace.citations[0]?.source.state).toBe('available');
    expect(citationTrace.citations[0]?.paper).not.toHaveProperty('storageKey');
    expect(citationTrace.citations[0]?.paper).not.toHaveProperty('checksum');
    expect(citationTrace.citations[0]).not.toHaveProperty('actorUserId');
    expect(citationTrace.citations[0]).not.toHaveProperty('ownerId');
    expect(citationTrace.citations[0]).not.toHaveProperty('visibility');
    expect(citationTrace.citations[0]).not.toHaveProperty('scope');
    expect(citationTrace.citations[0]).not.toHaveProperty('scopeType');
    expect(citationTrace.citations[0].projectLibraryEntry).not.toHaveProperty('spaceId');
    expect(citationTrace.citations[0].projectLibraryEntry).not.toHaveProperty('visibility');
    expect(citationTrace.citations[0].projectLibraryEntry).not.toHaveProperty('addedByUserId');
    expect(citationTrace.citations[0].readerExcerpt).not.toHaveProperty('note');
    expect(citationTrace.citations[0].readerExcerpt).not.toHaveProperty('ownerId');
    expect(citationTrace.citations[0].readerExcerpt).not.toHaveProperty('createdByUserId');
    expect(citationTrace.citations[0].readerExcerpt).not.toHaveProperty('spaceId');
    expect(citationTrace.citations[0].readerExcerpt).not.toHaveProperty('scopeType');
    expect(citationTrace.citations[0]?.readerExcerpt?.quote).toBe('source-backed quote');
    const unavailableTraceSource = unavailableTrace.citations[0]?.source;
    expect(unavailableTraceSource?.state).toBe('adoption_needed');
    if (unavailableTraceSource?.state !== 'adoption_needed') {
      throw new Error('Expected the trace source to require project adoption.');
    }
    expect(unavailableTraceSource.details).not.toHaveProperty('ownerId');
    expect(unavailableTraceSource.details).not.toHaveProperty('actorUserId');
    expect(unavailableTraceSource.details).not.toHaveProperty('spaceId');
    expect(unavailableTraceSource.details).not.toHaveProperty('visibility');
    expect(notebookAdoptionRequest.notebookDocumentId).toBe(notebookDoc.id);
    expect(notebookAdoptionRequest).not.toHaveProperty('ownerId');
    expect(notebookAdoptionRequest).not.toHaveProperty('projectId');
    expect(notebookAdoptionRequest).not.toHaveProperty('actorUserId');
    expect(notebookAdoptionResponse.provenance).toMatchObject({
      projectDocId: projectDoc.id,
      projectId: projectDoc.projectId,
      sourceNotebookDocumentId: notebookDoc.id,
      sourceNotebookVersionId: notebookSnapshot.versionId,
      sourceNotebookVersionNumber: notebookSnapshot.versionNumber,
    });
    expect(notebookAdoptionResponse.provenance.projectLibraryEntryIds).toEqual([
      'entry_project_001',
    ]);
    expect(notebookAdoptionResponse.provenance).not.toHaveProperty('ownerId');
    expect(notebookAdoptionResponse.provenance).not.toHaveProperty('actorUserId');
    expect(notebookAdoptionResponse.provenance).not.toHaveProperty('spaceId');
    expect(notebookAdoptionResponse.provenance).not.toHaveProperty('visibility');
    expect(JSON.stringify(citationTrace)).not.toContain('private notebook');
    expect(JSON.stringify(citationTrace)).not.toContain('storageKey');
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

  it('exports command search payloads for browser-safe internal object lookup', () => {
    expect(commandSearch).toBeTruthy();

    const scope: CommandSearchResultScope = {
      id: 'project_001',
      projectId: 'project_001',
      type: 'project',
    };
    const result: CommandSearchResult = {
      id: 'project-doc:doc_001',
      kind: 'project-doc',
      metadata: {
        publishState: 'draft',
        versionNumber: 2,
      },
      route: '/projects/project_001/writing/doc_001',
      scope,
      subtitle: 'Project Doc · draft',
      title: 'Shared synthesis',
      updatedAt: '2026-05-18T00:00:00.000Z',
    };
    const response: CommandSearchResponse = {
      contract: commandSearch.commandSearchContract,
      generatedAt: '2026-05-18T00:01:00.000Z',
      projectId: 'project_001',
      query: 'synthesis',
      results: [result],
      totalCount: 1,
    };

    expect(response.contract).toBe('jixia-command-search-contract');
    expect(response.results[0]?.route).toBe('/projects/project_001/writing/doc_001');
    expect(response.results[0]?.metadata?.versionNumber).toBe(2);
    expectTypeOf<CommandSearchObjectKind>().toEqualTypeOf<
      'project' | 'project-doc' | 'library-entry' | 'notebook' | 'job'
    >();
    expectTypeOf<CommandSearchResult['metadata']>().toMatchTypeOf<
      Record<string, string | number | boolean | null> | undefined
    >();
  });
});
