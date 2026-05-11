import { describe, expect, expectTypeOf, it } from 'vitest';

import * as jobs from '../../src/shared/contracts/jobs';
import * as library from '../../src/shared/contracts/library';
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
  ScopeRef,
} from '../../src/shared/contracts/projects';
import type {
  ConversationRecord,
  NoteRecord,
  ReadingStateRecord,
} from '../../src/shared/contracts/reading';
import type {
  PublishState,
} from '../../src/shared/contracts/writing';
import type {
  NotebookCitationRecord,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
} from '../../src/shared/contracts/notebook';
import type {
  ProjectDocCitationRecord,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '../../src/shared/contracts/project-docs';
import type {
  JobAuditRecord,
  JobEventRecord,
  JobRecord,
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

    expect(personalScope.type).toBe('user');
    expect(projectScope.type).toBe('project');
    expect(createProjectRequest.spaceId).toBe('space_001');
    expect(listItem.membership.role).toBe('owner');
    expect(projects.projectsContract).toBe('jixia-projects-contract');

    expectTypeOf<ProjectStatus>().toEqualTypeOf<'active' | 'archived'>();
    expectTypeOf<ProjectMemberRole>().toEqualTypeOf<
      'owner' | 'editor' | 'viewer'
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

    expect(importRequest.sourceType).toBe('doi');
    expect(entryView.entry.paperAssetId).toBe('asset_001');
    expect(entryView.entry.scope).toEqual({ type: 'user', id: 'user_001' });
    expect(entryView.entry.spaceId).toBe('');
    expect(entryView.entry.visibility).toBe('private');

    const libraryEntryShape: {
      entry: LibraryEntryRecord;
      asset: PaperAssetRecord;
    } = entryView;

    expect(libraryEntryShape.asset.id).toBe('asset_001');
  });

  it('exports reading payloads for notes and conversations', () => {
    expect(reading).toBeTruthy();

    const note: NoteRecord = {
      id: 'note_001',
      libraryEntryId: 'entry_001',
      authorUserId: 'user_001',
      visibility: 'private',
      body: 'Key finding with evidence link',
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

    expect(note.visibility).toBe('private');
    expect(conversation.title).toContain('Summarize');
    expect(readingState.progressPercent).toBe(40);
  });

  it('exports explicit notebook and project-doc writing payloads', () => {
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
      versionId: 'notebook_version_001',
      versionNumber: 1,
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
      versionId: 'project_doc_version_001',
      versionNumber: 2,
    };

    expect(notebookSnapshot.document.ownerId).toBe('user_001');
    expect(notebookSnapshot.citations[0]?.evidenceSpan).toBe('p. 4');
    expect(projectDocSnapshot.document.publishState).toBe('draft');
    expect(projectDocSnapshot.citations[0]?.projectDocVersionId).toBe(
      'project_doc_version_001',
    );
    expect(notebook.notebookContract).toBe('jixia-notebook-contract');
    expect(projectDocs.projectDocsContract).toBe('jixia-project-docs-contract');

    expectTypeOf<PublishState>().toEqualTypeOf<
      'draft' | 'review' | 'published'
    >();
  });

  it('exports job payloads for status queries, events, and audits', () => {
    expect(jobs).toBeTruthy();

    const statusQuery: JobStatusQuery = { jobId: 'job_001' };
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
