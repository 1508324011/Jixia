import { describe, expect, expectTypeOf, it } from 'vitest';

import * as jobs from '../../src/shared/contracts/jobs';
import * as library from '../../src/shared/contracts/library';
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
  ConversationRecord,
  NoteRecord,
  ReadingStateRecord,
} from '../../src/shared/contracts/reading';
import type {
  CitationLinkRecord,
  PublishState,
  WritingDocRecord,
  WritingDocSnapshot,
} from '../../src/shared/contracts/writing';
import type {
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
      id: 'entry_001',
      spaceId: 'space_001',
      paperAssetId: 'asset_001',
      visibility: 'space_shared',
      addedAt: '2026-03-21T00:00:00.000Z',
    };
    const entryView: LibraryEntryView = {
      entry,
      asset,
    };

    expect(importRequest.sourceType).toBe('doi');
    expect(entryView.entry.paperAssetId).toBe('asset_001');

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

  it('exports writing payloads for snapshots and citations', () => {
    expect(writing).toBeTruthy();

    const doc: WritingDocRecord = {
      id: 'doc_001',
      spaceId: 'space_001',
      title: 'Server-first writing draft',
      publishState: 'draft',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const citation: CitationLinkRecord = {
      id: 'citation_001',
      docVersionId: 'version_001',
      paperAssetId: 'asset_001',
      evidenceSpan: 'p. 4',
    };
    const snapshot: WritingDocSnapshot = {
      doc,
      docVersionId: 'version_001',
      content: '# Draft',
      citations: [citation],
      capturedAt: '2026-03-21T00:00:00.000Z',
    };

    expect(snapshot.doc.publishState).toBe('draft');
    expect(snapshot.citations).toHaveLength(1);
    expect(snapshot.citations[0]?.evidenceSpan).toBe('p. 4');

    expectTypeOf<PublishState>().toEqualTypeOf<
      'draft' | 'review' | 'published'
    >();
  });

  it('exports job payloads for status queries and events', () => {
    expect(jobs).toBeTruthy();

    const statusQuery: JobStatusQuery = { jobId: 'job_001' };
    const status: JobStatus = 'running';
    const job: JobRecord = {
      id: 'job_001',
      kind: 'reading_summary',
      status,
      credentialRef: 'cred_001',
      createdAt: '2026-03-21T00:00:00.000Z',
    };
    const event: JobEventRecord = {
      id: 'event_001',
      jobId: 'job_001',
      status,
      message: 'Summarization started',
      recordedAt: '2026-03-21T00:00:00.000Z',
    };

    expect(statusQuery.jobId).toBe('job_001');
    expect(job.status).toBe('running');
    expect(event.message).toContain('started');

    expectTypeOf<JobStatus>().toEqualTypeOf<
      'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    >();
  });
});
