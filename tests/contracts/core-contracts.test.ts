import { describe, expect, expectTypeOf, it } from 'vitest';

import * as aiChat from '../../src/shared/contracts/ai-chat';
import * as aiWorkspace from '../../src/shared/contracts/ai-workspace';
import * as aiResults from '../../src/shared/contracts/ai-results';
import * as audit from '../../src/shared/contracts/audit';
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
import * as readerAnnotations from '../../src/shared/contracts/reader-annotations';
import * as spaces from '../../src/shared/contracts/spaces';
import * as sourceText from '../../src/shared/contracts/source-text';
import * as todayContinuation from '../../src/shared/contracts/today-continuation';
import * as writing from '../../src/shared/contracts/writing';

import type {
  GovernanceAuditRecord,
} from '../../src/shared/contracts/audit';
import type {
  AiResultAppliedTarget,
  AiResultArtifactRecord,
  ApplyAiResultToNotebookRequest,
  ListAiResultArtifactsResponse,
} from '../../src/shared/contracts/ai-results';
import type {
  AiContextPackDetail,
  AiContextSourceRef,
  AiWorkspaceSessionRecord,
  CreateAiWorkspaceJobRequest,
} from '../../src/shared/contracts/ai-workspace';
import type {
  AiChatRequestTraceRecord,
  AiChatSessionRecord,
  CreateAiChatMessageRequest,
} from '../../src/shared/contracts/ai-chat';
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
  ProjectWorkspaceReviewKind,
  ProjectWorkspaceReviewPriority,
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
  GetReaderDefaultNotebookRequest,
  ListNotebookDocumentsResponse,
  NotebookCitationRecord,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
  NotebookDocumentSnapshotWithSourceLinks,
  NotebookSourceLinkRecord,
  NotebookSourceExcerptBlock,
  ReaderNotebookBindingRecord,
} from '../../src/shared/contracts/notebook';
import type {
  AdoptNotebookIntoProjectDocRequest,
  AdoptNotebookIntoProjectDocResponse,
  CreateProjectDocCitationInput,
  ProjectDocCitationRecord,
  ProjectDocCitationTraceResponse,
  ProjectDocNotebookAdoptionProvenance,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '../../src/shared/contracts/project-docs';
import type {
  CreateReaderAnnotationRequest,
  PublishReaderAnnotationToProjectRequest,
  ReaderAnnotationRecord,
} from '../../src/shared/contracts/reader-annotations';
import type {
  SourceTextArtifactRecord,
  SourceTextAttachmentState,
} from '../../src/shared/contracts/source-text';
import type {
  JobAuditRecord,
  CancelJobRequest,
  JobEventRecord,
  JobRecord,
  RunJobRequest,
  JobStatus,
  JobStatusQuery,
} from '../../src/shared/contracts/jobs';
import type {
  TodayContinuationActionSource,
  TodayContinuationPriority,
  TodayContinuationResponse,
  TodayContinuationSectionKind,
} from '../../src/shared/contracts/today-continuation';

describe('core contracts', () => {
  it('exports server-owned AI result artifact contracts without browser authority fields', () => {
    expect(aiResults.aiResultsContract).toBe('jixia-ai-results-contract-v1');

    const appliedTarget: AiResultAppliedTarget = {
      notebookDocumentId: 'notebook-document_001',
      notebookVersionId: 'notebook-version_001',
      notebookVersionNumber: 2,
      type: 'notebookDocument',
    };
    const result: AiResultArtifactRecord = {
      appliedAt: '2026-06-06T00:10:00.000Z',
      appliedTarget,
      createdAt: '2026-06-06T00:00:00.000Z',
      createdByUserId: 'user-alice',
      documentContent: {
        blocks: [{ text: 'Server-owned AI result draft.', type: 'paragraph' }],
        schemaVersion: 1,
      },
      id: 'ai-result_001',
      jobId: 'job_001',
      kind: 'ai-workspace.context-pack',
      plainTextPreview: 'Server-owned AI result draft.',
      provenance: {
        contextPackId: 'context-pack_001',
        generatedInsightIds: ['generated-insight_001'],
        projectDocCitationIds: ['project-doc-citation_001'],
        projectDocVersionIds: ['project-doc-version_001'],
        projectLibraryEntryIds: ['library-entry_001'],
        readerExcerptIds: ['reader-excerpt_001'],
      },
      scope: { id: 'project_001', type: 'project' },
      status: 'applied',
      summary: 'Safe bounded result summary.',
      title: 'Evidence-linked draft',
      updatedAt: '2026-06-06T00:10:00.000Z',
    };
    const listResponse: ListAiResultArtifactsResponse = {
      contract: aiResults.aiResultsContract,
      results: [result],
      scope: { id: 'project_001', type: 'project' },
    };
    const applyRequest: ApplyAiResultToNotebookRequest = {
      insertion: { mode: 'append', targetBlockId: 'block_001' },
      notebookDocumentId: 'notebook-document_001',
    };

    expect(listResponse.results[0]?.provenance.contextPackId).toBe('context-pack_001');
    expect(applyRequest).toEqual({
      insertion: { mode: 'append', targetBlockId: 'block_001' },
      notebookDocumentId: 'notebook-document_001',
    });
    expect(JSON.stringify({ applyRequest, listResponse })).not.toMatch(
      /credentialRef|rawSecret|apiKey|password|token|storageKey|checksum|rawProviderPayload|rawJobPayload|payload|ownerId|scopeId|scopeType|spaceId|visibility/i,
    );
    expectTypeOf<ApplyAiResultToNotebookRequest>().toEqualTypeOf<{
      insertion?: {
        mode?: 'append' | 'replace';
        targetBlockId?: string;
      };
      notebookDocumentId: string;
    }>();
  });

  it('exports AI Workspace context pack contracts as source refs instead of raw context', () => {
    expect(aiWorkspace.aiWorkspaceContract).toBe('jixia-ai-workspace-context-packs-v1');
    expect(aiWorkspace.AI_WORKSPACE_JOB_KIND).toBe('ai-workspace.context-pack');
    expect(aiWorkspace.AI_WORKSPACE_CONTEXT_SOURCE_TYPES).toEqual([
      'projectDocVersion',
      'projectLibraryEntry',
      'readerExcerpt',
      'projectDocCitation',
      'generatedInsight',
    ]);

    const session: AiWorkspaceSessionRecord = {
      createdAt: '2026-06-05T00:00:00.000Z',
      id: 'ai-session_001',
      scope: { id: 'project_001', type: 'project' },
      title: 'Shared synthesis session',
      updatedAt: '2026-06-05T00:00:00.000Z',
    };
    const source: AiContextSourceRef = {
      libraryEntryId: 'library-entry_001',
      sourceType: 'projectLibraryEntry',
    };
    const detail: AiContextPackDetail = {
      contract: aiWorkspace.aiWorkspaceContract,
      items: [
        {
          contextPackId: 'ai-context-pack_001',
          createdAt: '2026-06-05T00:01:00.000Z',
          id: 'ai-context-item_001',
          source,
        },
      ],
      pack: {
        createdAt: '2026-06-05T00:01:00.000Z',
        id: 'ai-context-pack_001',
        itemCount: 1,
        sessionId: session.id,
        title: 'Authorized source refs',
        updatedAt: '2026-06-05T00:01:00.000Z',
      },
      session,
    };
    const jobRequest: CreateAiWorkspaceJobRequest = {
      contextPackId: detail.pack.id,
      credentialRef: 'cred_001',
      instruction: 'Synthesize these authorized refs.',
    };

    expect(detail.items[0]?.source.sourceType).toBe('projectLibraryEntry');
    expect(jobRequest.contextPackId).toBe(detail.pack.id);
    expect(JSON.stringify({ detail, jobRequest })).not.toMatch(
      /rawContext|storageKey|checksum|apiKey|password|token|secret|notebookDocumentVersion/i,
    );
    expectTypeOf<AiContextSourceRef>().toEqualTypeOf<
      | {
          projectDocId: string;
          projectDocVersionId: string;
          sourceType: 'projectDocVersion';
        }
      | {
          libraryEntryId: string;
          sourceType: 'projectLibraryEntry';
        }
      | {
          readerExcerptId: string;
          sourceType: 'readerExcerpt';
        }
      | {
          citationId: string;
          projectDocId: string;
          projectDocVersionId?: string;
          sourceType: 'projectDocCitation';
        }
      | {
          generatedInsightId: string;
          libraryEntryId: string;
          sourceType: 'generatedInsight';
        }
    >();
  });

  it('exports private AIChat trace contracts with request context refs only', () => {
    expect(aiChat.aiChatContract).toBe('jixia-private-ai-chat-trace-contract-v1');

    const session: AiChatSessionRecord = {
      createdAt: '2026-06-08T00:00:00.000Z',
      id: 'ai-chat-session_001',
      lifecycleStatus: 'active',
      sourceContext: {
        id: 'library-entry_001',
        type: 'libraryEntry',
      },
      title: 'Private reader-side conversation',
      updatedAt: '2026-06-08T00:00:00.000Z',
    };
    const messageRequest: CreateAiChatMessageRequest = {
      body: 'Compare the selected annotations without attaching whole documents.',
      contextRefs: [
        {
          readerAnnotationId: 'reader-annotation-project-copy_001',
          sourceType: 'readerAnnotation',
        },
        {
          range: {
            endOffset: 96,
            locator: 'p. 4 ¶2',
            sourceTextArtifactId: 'source-text-artifact_001',
            startOffset: 48,
          },
          sourceType: 'sourceTextArtifactRange',
        },
      ],
      credentialRef: 'credential-ref_001',
    };
    const trace: AiChatRequestTraceRecord = {
      contextRefs: [
        {
          chipLabel: 'Annotation · p. 4',
          createdAt: '2026-06-08T00:00:01.000Z',
          id: 'ai-chat-request-context_001',
          requestId: 'ai-chat-request_001',
          source: {
            readerAnnotationId: 'reader-annotation-project-copy_001',
            sourceType: 'readerAnnotation',
          },
          tokenEstimate: 64,
        },
        {
          chipLabel: 'Exact text range · p. 4 ¶2',
          createdAt: '2026-06-08T00:00:01.000Z',
          id: 'ai-chat-request-context_002',
          requestId: 'ai-chat-request_001',
          source: {
            range: {
              endOffset: 96,
              locator: 'p. 4 ¶2',
              sourceTextArtifactId: 'source-text-artifact_001',
              startOffset: 48,
            },
            sourceType: 'sourceTextArtifactRange',
          },
          tokenEstimate: 24,
        },
      ],
      contextTokenEstimate: 88,
      costEstimate: 0.04,
      createdAt: '2026-06-08T00:00:01.000Z',
      id: 'ai-chat-request_001',
      overBudgetDecision: 'included-selected-ranges-only',
      promptBuildVersion: 'reader-chat-prompt-v1',
      responseTokenEstimate: 256,
      safeMetadata: {
        selectedContextCount: 2,
        usedWholeDocumentFallback: false,
      },
      sessionId: session.id,
      status: 'built',
      updatedAt: '2026-06-08T00:00:01.000Z',
    };

    expect(session.sourceContext?.type).toBe('libraryEntry');
    expect(messageRequest.contextRefs?.map((source) => source.sourceType)).toEqual([
      'readerAnnotation',
      'sourceTextArtifactRange',
    ]);
    expect(trace.contextRefs[0]?.chipLabel).toBe('Annotation · p. 4');
    expect(trace.contextRefs[1]?.source).toMatchObject({
      sourceType: 'sourceTextArtifactRange',
    });
    if (trace.contextRefs[1]?.source.sourceType !== 'sourceTextArtifactRange') {
      throw new Error('Expected a source text artifact range ref.');
    }
    expect(trace.contextRefs[1].source.range).not.toHaveProperty('quote');
    expect(trace.promptBuildVersion).toBe('reader-chat-prompt-v1');
    expect(trace.safeMetadata?.usedWholeDocumentFallback).toBe(false);
    expect(messageRequest).not.toHaveProperty('actorUserId');
    expect(messageRequest).not.toHaveProperty('ownerId');
    expect(messageRequest).not.toHaveProperty('projectId');
    expect(messageRequest).not.toHaveProperty('visibility');
    expect(JSON.stringify({ messageRequest, trace })).not.toMatch(
      /rawContext|rawProviderPayload|attachedSourceText|authHeader|apiKey|password|storageKey|checksum|privateDocumentBody|providerSecret/i,
    );
    expectTypeOf<CreateAiChatMessageRequest>().toMatchTypeOf<{
      body: string;
      contextRefs?: unknown[];
      credentialRef?: string;
    }>();
    expectTypeOf<AiChatRequestTraceRecord['safeMetadata']>().toMatchTypeOf<
      Record<string, boolean | null | number | string> | undefined
    >();
  });

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
      review: {
        emptyState: {
          body: 'Project review and attention items will appear when shared Project Docs enter review, project jobs need monitoring, or project Reader collaboration creates comments and excerpts.',
          title: 'No project review items yet',
        },
        items: [
          {
            href: '/projects/project_001/library/entry_001/reader',
            id: 'reader-comment:comment_001',
            kind: 'reader-comment',
            occurredAt: '2026-05-03T00:08:30.000Z',
            priority: 'context',
            projectId: project.id,
            sourceId: 'comment_001',
            sourceLabel: 'Reader comment',
            summary: 'Recent project Reader comment · Shared synthesis source',
            title: 'Shared project comment',
          },
          {
            href: '/projects/project_001/library/entry_001/reader',
            id: 'reader-excerpt:excerpt_001',
            kind: 'reader-excerpt',
            occurredAt: '2026-05-03T00:08:00.000Z',
            priority: 'context',
            projectId: project.id,
            sourceId: 'excerpt_001',
            sourceLabel: 'Reader excerpt',
            summary: 'Recent project Reader excerpt · Shared synthesis source · loc-1',
            title: 'Evidence quote',
          },
          {
            href: '/jobs?scopeType=project&scopeId=project_001&jobId=job_001',
            id: 'job-attention:job_001',
            kind: 'job-attention',
            occurredAt: '2026-05-03T00:07:00.000Z',
            priority: 'monitor',
            projectId: project.id,
            sourceId: 'job_001',
            sourceLabel: 'Project job',
            summary: 'Governed project job needs monitoring · queued',
            title: 'ai.summary',
          },
        ],
        projectId: project.id,
        summary: {
          collaborationSignals: 2,
          documentsInReview: 0,
          jobsNeedingAttention: 1,
          newestReviewTimestamp: '2026-05-03T00:08:30.000Z',
          totalReviewItems: 3,
        },
        totalCount: 3,
      },
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
    expect(workspace.review.summary.totalReviewItems).toBe(3);
    expect(workspace.review.items[0]?.sourceId).toBe('comment_001');
    expect(workspace.review.items[0]).not.toHaveProperty('actorUserId');
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
    expectTypeOf<ProjectWorkspaceReviewKind>().toEqualTypeOf<
      'project-doc-review' | 'job-attention' | 'reader-comment' | 'reader-excerpt'
    >();
    expectTypeOf<ProjectWorkspaceReviewPriority>().toEqualTypeOf<
      'review' | 'attention' | 'monitor' | 'context'
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
      projectReview: {
        emptyState: {
          body: 'Project review and attention items will appear here when visible projects have Project Docs in review, governed jobs needing monitoring, or project Reader collaboration signals.',
          title: 'No project review items yet',
        },
        items: [
          {
            href: '/projects/project_001/writing/project-doc_001',
            id: 'project-review:project_001:project-doc-review:project-doc_001',
            kind: 'project-doc-review',
            occurredAt: '2026-05-17T00:00:00.000Z',
            priority: 'review',
            projectId: 'project_001',
            projectName: 'Project Alpha',
            sourceId: 'project-doc_001',
            sourceLabel: 'Project Doc',
            summary: 'Project Doc is in review · version 1',
            title: 'Shared synthesis',
          },
        ],
        summary: {
          collaborationSignals: 0,
          documentsInReview: 1,
          jobsNeedingAttention: 0,
          newestReviewTimestamp: '2026-05-17T00:00:00.000Z',
          projectsWithReviewItems: 1,
          totalReviewItems: 1,
          visibleProjects: 1,
        },
        totalCount: 1,
      },
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
              description: 'Review visible projects.',
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
    expect(response.projectReview.summary.documentsInReview).toBe(1);
    expect(response.projectReview.items[0]?.sourceId).toBe('project-doc_001');
    expect(response.recentActivity[0]?.kind).toBe('job');

    expectTypeOf<HomeCockpitWorkbenchContext['scope']>().toEqualTypeOf<ScopeRef>();
    expectTypeOf<HomeCockpitSectionId>().toEqualTypeOf<
      'collaboration' | 'library' | 'writing' | 'jobs'
    >();
    expectTypeOf<HomeCockpitSectionStatus>().toEqualTypeOf<
      'empty' | 'active' | 'attention'
    >();
  });

  it('exports the browser-safe Today continuation read-model contract', () => {
    expect(todayContinuation.todayContinuationContract).toBe('jixia.today.continuation.v1');

    const response: TodayContinuationResponse = {
      contract: todayContinuation.todayContinuationContract,
      emptyState: {
        body: 'No personal continuation facts need action right now.',
        href: '/search',
        title: 'No continuation items for today',
      },
      generatedAt: '2026-06-04T00:00:00.000Z',
      nextActions: [
        {
          description: 'Continue from the personal Reader.',
          href: '/library/entry_001/reader',
          id: 'action:reader:entry_001',
          label: 'Continue reading',
          priority: 'high',
          reason: 'Reading progress 64% · Jixia continuation paper',
          source: 'reader',
        },
      ],
      sections: [
        {
          description: 'Personal Library entries where this actor has meaningful incomplete reading progress.',
          emptyState: {
            body: 'Personal Library entries with meaningful saved reading progress will appear here.',
            href: '/library',
            title: 'No in-progress readings',
          },
          items: [
            {
              href: '/library/entry_001/reader',
              id: 'reader:entry_001',
              kind: 'in_progress_reading',
              priority: 'high',
              sourceLabel: 'pmid:123456',
              summary: 'Reading progress 64% · continue from the personal Reader.',
              timestamp: '2026-06-04T00:00:00.000Z',
              title: 'Jixia continuation paper',
            },
          ],
          kind: 'in_progress_reading',
          title: 'Continue reading',
          totalCount: 1,
        },
        {
          description: 'Server-classified governed job statuses for personal and visible project scopes.',
          emptyState: {
            body: 'Governed jobs that are failed, queued, or running will appear here.',
            href: '/ai-workspace',
            title: 'No AI jobs need action',
          },
          items: [
            {
              href: '/jobs?jobId=job_001',
              id: 'ai-job:job_001',
              kind: 'ai_jobs',
              priority: 'medium',
              sourceLabel: 'Personal AI job',
              summary: 'Governed personal job status · queued',
              timestamp: '2026-06-04T00:00:00.000Z',
              title: 'ai.summary',
            },
          ],
          kind: 'ai_jobs',
          title: 'Governed AI jobs needing action',
          totalCount: 1,
        },
      ],
      summary: {
        aiJobsNeedingAction: 1,
        inProgressReadings: 1,
        notebookDrafts: 0,
        projectReviewItems: 0,
        unreadImports: 0,
      },
    };

    const serialized = JSON.stringify(response);

    expect(response.contract).toBe(todayContinuation.todayContinuationContract);
    expect(response.sections[0]?.items[0]?.href).toBe('/library/entry_001/reader');
    expect(response.nextActions[0]?.source).toBe('reader');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('checksum');
    expect(serialized).not.toContain('JIXIA_STORAGE_ROOT');
    expect(serialized).not.toContain('papers/');
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('credentialRef');
    expect(serialized).not.toContain('rawSecret');
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('encryptedSecret');
    expect(serialized).not.toContain('actorUserId');
    expect(serialized).not.toContain('requestedByUserId');
    expect(serialized).not.toContain('authorUserId');
    expect(serialized).not.toContain('startedByUserId');
    expect(serialized).not.toContain('actorSpaceId');
    expect(serialized).not.toContain('createdByUserId');
    expect(serialized).not.toContain('ownerId');
    expect(serialized).not.toContain('projectId');
    expect(serialized).not.toContain('scopeId');
    expect(serialized).not.toContain('scopeType');
    expect(serialized).not.toContain('spaceId');
    expect(serialized).not.toContain('visibility');

    expectTypeOf<TodayContinuationSectionKind>().toEqualTypeOf<
      'in_progress_reading' | 'new_imports' | 'notebook_drafts' | 'project_review' | 'ai_jobs'
    >();
    expectTypeOf<TodayContinuationPriority>().toEqualTypeOf<'high' | 'medium' | 'low'>();
    expectTypeOf<TodayContinuationActionSource>().toEqualTypeOf<
      'library' | 'reader' | 'notebook' | 'project' | 'ai_job'
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

  it('exports explicit source text and canonical reader annotation contracts', () => {
    expect(sourceText.sourceTextContract).toBe(
      'jixia-source-text-artifact-contract-v1',
    );
    expect(readerAnnotations.readerAnnotationsContract).toBe(
      'jixia-reader-annotations-contract-v1',
    );

    const unavailableAttachment: SourceTextAttachmentState = {
      availabilityState: 'ocr_required',
      reason: 'OCR required before exact text ranges can be attached.',
    };
    const artifact: SourceTextArtifactRecord = {
      availabilityState: 'available',
      characterCount: 1280,
      createdAt: '2026-06-08T00:00:00.000Z',
      id: 'source-text-artifact_001',
      kind: 'extracted_text',
      language: 'en',
      pageCount: 8,
      paperAssetId: 'asset_001',
      textFormat: 'text/plain',
      updatedAt: '2026-06-08T00:00:00.000Z',
    };
    const createAnnotationRequest: CreateReaderAnnotationRequest = {
      libraryEntryId: 'library-entry-personal_001',
      locator: {
        label: 'p. 4 ¶2',
        pageNumber: 4,
        range: {
          endOffset: 96,
          locator: 'p. 4 ¶2',
          page: {
            endOffset: 96,
            label: '4',
            pageNumber: 4,
            startOffset: 48,
          },
          quote: 'bounded source text range',
          sourceTextArtifactId: artifact.id,
          startOffset: 48,
        },
      },
      note: 'Private interpretation remains owner-only.',
      quote: 'bounded source text range',
      selector: {
        exact: 'bounded source text range',
        prefix: 'before ',
        suffix: ' after',
        type: 'textQuote',
      },
      sourceContext: {
        id: 'library-entry-personal_001',
        type: 'libraryEntry',
      },
      sourceTextArtifactId: artifact.id,
    };
    const privateAnnotation: ReaderAnnotationRecord = {
      copyState: { state: 'private_original' },
      createdAt: '2026-06-08T00:00:01.000Z',
      id: 'reader-annotation-private_001',
      libraryEntryId: 'library-entry-personal_001',
      lifecycleStatus: 'active',
      locator: createAnnotationRequest.locator,
      note: createAnnotationRequest.note,
      paperAssetId: artifact.paperAssetId,
      quote: createAnnotationRequest.quote,
      selector: createAnnotationRequest.selector,
      sourceContext: createAnnotationRequest.sourceContext,
      sourceTextArtifactId: artifact.id,
      updatedAt: '2026-06-08T00:00:01.000Z',
      visibility: 'private',
    };
    const publishRequest: PublishReaderAnnotationToProjectRequest = {
      sourceAnnotationId: privateAnnotation.id,
      targetLibraryEntryId: 'library-entry-project_001',
    };
    const projectCopy: ReaderAnnotationRecord = {
      copyState: {
        copiedAt: '2026-06-08T00:00:02.000Z',
        state: 'project_copy',
      },
      createdAt: privateAnnotation.createdAt,
      id: 'reader-annotation-project-copy_001',
      libraryEntryId: publishRequest.targetLibraryEntryId,
      lifecycleStatus: privateAnnotation.lifecycleStatus,
      locator: privateAnnotation.locator,
      paperAssetId: privateAnnotation.paperAssetId,
      projectId: 'project_001',
      quote: privateAnnotation.quote,
      selector: privateAnnotation.selector,
      sourceContext: privateAnnotation.sourceContext,
      sourceTextArtifactId: privateAnnotation.sourceTextArtifactId,
      updatedAt: '2026-06-08T00:00:02.000Z',
      visibility: 'project',
    };
    const serializedProjectCopy = JSON.stringify(projectCopy);

    expect(unavailableAttachment.availabilityState).toBe('ocr_required');
    expect(artifact.availabilityState).toBe('available');
    expect(artifact).not.toHaveProperty('storageKey');
    expect(artifact).not.toHaveProperty('checksum');
    expect(artifact).not.toHaveProperty('text');
    expect(createAnnotationRequest).not.toHaveProperty('actorUserId');
    expect(createAnnotationRequest).not.toHaveProperty('ownerId');
    expect(createAnnotationRequest).not.toHaveProperty('projectId');
    expect(createAnnotationRequest).not.toHaveProperty('visibility');
    expect(privateAnnotation.visibility).toBe('private');
    expect(projectCopy.visibility).toBe('project');
    expect(projectCopy.copyState.state).toBe('project_copy');
    expect(projectCopy.id).not.toBe(privateAnnotation.id);
    expect(projectCopy.libraryEntryId).toBe('library-entry-project_001');
    expect(projectCopy).not.toHaveProperty('note');
    expect(serializedProjectCopy).not.toContain('Private interpretation remains owner-only.');
    expect(serializedProjectCopy).not.toMatch(
      /"note"|Private interpretation remains owner-only|rawSourceText|fullText|storageKey|checksum|actorUserId|ownerId|privateDocumentBody|providerSecret/i,
    );
    expect(publishRequest).not.toHaveProperty('projectId');
    expect(publishRequest).not.toHaveProperty('actorUserId');
    expect(JSON.stringify({ artifact, createAnnotationRequest, projectCopy })).not.toMatch(
      /rawSourceText|fullText|storageKey|checksum|actorUserId|ownerId|privateDocumentBody|providerSecret/i,
    );
    expectTypeOf<SourceTextAttachmentState['availabilityState']>().toEqualTypeOf<
      | 'archived'
      | 'available'
      | 'failed'
      | 'ocr_required'
      | 'pdf_unavailable'
      | 'processing'
      | 'text_unavailable'
    >();
    expectTypeOf<ReaderAnnotationRecord['visibility']>().toEqualTypeOf<
      'private' | 'project'
    >();
    expectTypeOf<Extract<ReaderAnnotationRecord, { visibility: 'private' }>>()
      .toMatchTypeOf<{ note?: string; visibility: 'private' }>();
    expectTypeOf<Extract<ReaderAnnotationRecord, { visibility: 'project' }>>()
      .toMatchTypeOf<{ note?: never; visibility: 'project' }>();
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
    const readerNotebookBinding: ReaderNotebookBindingRecord = {
      createdAt: '2026-06-08T00:00:00.000Z',
      notebookDocumentId: notebookDoc.id,
      sourceContext: {
        id: 'library-entry_001',
        type: 'libraryEntry',
      },
      updatedAt: '2026-06-08T00:00:00.000Z',
    };
    const getReaderDefaultNotebookRequest: GetReaderDefaultNotebookRequest = {
      sourceContext: readerNotebookBinding.sourceContext,
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
    const sourceLink: NotebookSourceLinkRecord = {
      createdAt: '2026-06-08T00:00:00.000Z',
      evidenceSpan: 'source-backed quote',
      id: 'notebook-source-link_001',
      locator: {
        endOffset: 96,
        locator: 'p. 4 ¶2',
        quote: 'source-backed quote',
        sourceTextArtifactId: 'source-text-artifact_001',
        startOffset: 48,
      },
      notebookDocumentVersionId: notebookSnapshot.versionId,
      paperAssetId: 'asset_001',
      readerAnnotationId: 'reader-annotation-private_001',
      sourceId: 'reader-annotation-private_001',
      sourceLibraryEntryId: 'library-entry_001',
      sourceTextArtifactId: 'source-text-artifact_001',
      sourceType: 'readerAnnotation',
    };
    const notebookSnapshotWithSourceLinks: NotebookDocumentSnapshotWithSourceLinks = {
      ...notebookSnapshot,
      sourceLinks: [sourceLink],
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
      lifecycleStatus: 'active',
      locator: {
        endOffset: 96,
        locator: 'Figure 2',
        quote: 'source-backed quote',
        sourceTextArtifactId: 'source-text-artifact_001',
        startOffset: 48,
      },
      locatorSource: {
        id: 'reader-annotation-project-copy_001',
        type: 'project_visible_reader_annotation',
      },
      occurrence: {
        key: 'citation-marker:body:0001',
        label: '[1]',
      },
      paperAssetId: 'asset_001',
      projectDocVersionId: 'project_doc_version_001',
      readerAnnotationId: 'reader-annotation-project-copy_001',
      readerExcerptId: 'excerpt_001',
      sourceTextArtifactId: 'source-text-artifact_001',
      target: {
        libraryEntryId: 'entry_project_001',
        paperAssetId: 'asset_001',
        projectId: 'project_001',
      },
      targetLibraryEntryId: 'entry_project_001',
    };
    const createProjectCitationInput: CreateProjectDocCitationInput = {
      evidenceSpan: 'fig. 2',
      locator: projectDocCitation.locator,
      locatorSource: projectDocCitation.locatorSource,
      occurrence: {
        key: 'citation-marker:body:0001',
        label: '[1]',
      },
      readerAnnotationId: 'reader-annotation-project-copy_001',
      sourceTextArtifactId: 'source-text-artifact_001',
      target: {
        libraryEntryId: 'entry_project_001',
        paperAssetId: 'asset_001',
      },
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
    expect(readerNotebookBinding.sourceContext.type).toBe('libraryEntry');
    expect(getReaderDefaultNotebookRequest).not.toHaveProperty('ownerId');
    expect(getReaderDefaultNotebookRequest).not.toHaveProperty('actorUserId');
    expect(sourceExcerpt.type).toBe('sourceExcerpt');
    expect(sourceExcerpt.readerExcerptId).toBe('excerpt_001');
    expect(sourceExcerpt.evidenceSpan).toBe('source-backed quote');
    expect(sourceLink.sourceType).toBe('readerAnnotation');
    expect(sourceLink.notebookDocumentVersionId).toBe(notebookSnapshot.versionId);
    expect(sourceLink).not.toHaveProperty('body');
    expect(sourceLink).not.toHaveProperty('content');
    expect(sourceLink).not.toHaveProperty('ownerId');
    expect(notebookSnapshotWithSourceLinks.sourceLinks).toEqual([sourceLink]);
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
    expect(projectDocSnapshot.citations[0]?.target).toEqual({
      libraryEntryId: 'entry_project_001',
      paperAssetId: 'asset_001',
      projectId: 'project_001',
    });
    expect(projectDocSnapshot.citations[0]?.occurrence?.key).toBe(
      'citation-marker:body:0001',
    );
    expect(projectDocSnapshot.citations[0]?.locatorSource?.type).toBe(
      'project_visible_reader_annotation',
    );
    expect(createProjectCitationInput.target.libraryEntryId).toBe('entry_project_001');
    expect(createProjectCitationInput.target).not.toHaveProperty('projectId');
    expect(createProjectCitationInput).not.toHaveProperty('paperAssetId');
    expect(createProjectCitationInput).not.toHaveProperty('actorUserId');
    expect(createProjectCitationInput).not.toHaveProperty('ownerId');
    expect(createProjectCitationInput).not.toHaveProperty('visibility');
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

  it('exports generic governance audit payloads without authority or secret fields', () => {
    expect(audit.auditContract).toBe('jixia-governance-audit-v1');

    const record: GovernanceAuditRecord = {
      action: 'job.created',
      actorUserId: 'user_001',
      detail: 'Created reading_summary with server-owned provider configuration.',
      id: 'audit_001',
      jobId: 'job_001',
      metadata: {
        jobKind: 'reading_summary',
        provider: 'openai',
      },
      object: { id: 'job_001', type: 'job' },
      projectId: 'project_001',
      recordedAt: '2026-06-06T00:00:00.000Z',
      scope: { id: 'project_001', type: 'project' },
      spaceId: 'space_001',
    };

    expect(record.scope).toEqual({ id: 'project_001', type: 'project' });
    expect(record.object).toEqual({ id: 'job_001', type: 'job' });
    expect(record.metadata?.provider).toBe('openai');
    expect(JSON.stringify(record)).not.toMatch(
      /rawSecret|apiKey|token|encryptedSecret|storageKey|checksum|payload|snapshot|content|body|cred-/i,
    );
    expectTypeOf<GovernanceAuditRecord['metadata']>().toMatchTypeOf<
      Record<string, string | number | boolean | null> | undefined
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
