import { describe, expect, it } from 'vitest';

import { createProjectWorkspaceService } from '../../src/server/services/project-workspace.service';

import type {
  JobRepository,
  LibraryRepository,
  PersistedProjectDocIndexItem,
  PersistedProjectReadingCommentRecord,
  PersistedReaderExcerptRecord,
  PersistedJobRecord,
  PersistedLibraryEntryView,
  ProjectDocRepository,
  ProjectRepository,
  ReadingRepository,
} from '../../src/db';

function makeDoc(
  index: number,
  capturedAt: string,
): PersistedProjectDocIndexItem {
  return {
    document: {
      createdAt: `2026-05-18T00:${String(index).padStart(2, '0')}:00.000Z`,
      createdByUserId: 'user-alice',
      id: `project-doc-${String(index).padStart(2, '0')}`,
      projectId: 'project-activity',
      publishState: index % 2 === 0 ? 'review' : 'draft',
      title: `Activity doc ${index}`,
      updatedAt: capturedAt,
    },
    latestVersion: {
      capturedAt,
      versionId: `project-doc-version-${String(index).padStart(2, '0')}`,
      versionNumber: index,
    },
  };
}

describe('project workspace service activity/resources projection', () => {
  it('derives a deterministic bounded multi-source activity feed and resources', async () => {
    const documents = Array.from({ length: 10 }, (_, offset) => {
      const index = offset + 1;

      return makeDoc(
        index,
        `2026-05-18T00:${String(index).padStart(2, '0')}:30.000Z`,
      );
    });
    const projectRepository = {
      getProjectForActor: async () => ({
        membership: {
          joinedAt: '2026-05-18T00:00:00.000Z',
          projectId: 'project-activity',
          role: 'viewer',
          userId: 'user-bob',
        },
        project: {
          createdAt: '2026-05-18T00:00:00.000Z',
          createdByUserId: 'user-alice',
          id: 'project-activity',
          name: 'Activity Project',
          spaceId: 'space-activity',
          status: 'active',
          updatedAt: '2026-05-18T00:10:00.000Z',
        },
      }),
    } as unknown as ProjectRepository;
    const projectDocRepository = {
      listDocumentsForProject: async () => documents,
    } as unknown as ProjectDocRepository;
    const libraryEntry: PersistedLibraryEntryView = {
      asset: {
        abstractText: 'Project source abstract',
        canonicalId: 'doi:10.1000/project-source',
        createdAt: '2026-05-18T00:02:00.000Z',
        id: 'paper-asset-01',
        importedByUserId: 'user-alice',
        sourceLocator: '10.1000/project-source',
        sourceType: 'doi',
        title: 'Project source paper',
        updatedAt: '2026-05-18T00:02:00.000Z',
      },
      entry: {
        addedByUserId: 'user-alice',
        createdAt: '2026-05-18T00:02:30.000Z',
        id: 'project-library-entry-01',
        paperAssetId: 'paper-asset-01',
        scope: { id: 'project-activity', type: 'project' },
        updatedAt: '2026-05-18T00:02:30.000Z',
      },
    };
    const libraryRepository = {
      listLibraryEntriesForScope: async () => [libraryEntry],
    } as unknown as LibraryRepository;
    const readingRepository = {
      listProjectCommentsForEntry: async (): Promise<PersistedProjectReadingCommentRecord[]> => [
        {
          authorUserId: 'user-alice',
          body: 'Project comment on a project library entry',
          createdAt: '2026-05-18T00:02:20.000Z',
          id: 'project-comment-01',
          kind: 'project_comment',
          libraryEntryId: libraryEntry.entry.id,
          projectId: 'project-activity',
        },
      ],
      listReaderExcerptsForEntry: async (): Promise<PersistedReaderExcerptRecord[]> => [
        {
          createdAt: '2026-05-18T00:02:10.000Z',
          createdByUserId: 'user-alice',
          endOffset: 48,
          id: 'reader-excerpt-01',
          libraryEntryId: libraryEntry.entry.id,
          locator: 'loc-1',
          note: 'Excerpt note',
          paperAssetId: libraryEntry.asset.id,
          quote: 'Evidence quote from the project source entry.',
          startOffset: 0,
          updatedAt: '2026-05-18T00:02:10.000Z',
        },
      ],
    } as unknown as ReadingRepository;
    const jobRepository = {
      listJobsForScope: async (): Promise<PersistedJobRecord[]> => [
        {
          createdAt: '2026-05-18T00:03:00.000Z',
          credentialRef: 'cred-01',
          id: 'job-01',
          kind: 'ai.summary',
          payload: '{"prompt":"summarize"}',
          requestedByUserId: 'user-alice',
          scope: { id: 'project-activity', type: 'project' },
          spaceId: 'space-activity',
          status: 'queued',
          updatedAt: '2026-05-18T00:03:30.000Z',
        },
      ],
    } as unknown as JobRepository;
    const service = createProjectWorkspaceService({
      jobRepository,
      libraryRepository,
      projectDocRepository,
      projectRepository,
      readingRepository,
    });

    const workspace = await service.getWorkspace('project-activity', 'user-bob');

    expect(workspace.activity.totalCount).toBe(14);
    expect(workspace.activity.items).toHaveLength(8);
    expect(workspace.activity.items.map((item) => item.sourceId)).toEqual([
      'project-doc-10',
      'project-doc-09',
      'project-doc-08',
      'project-doc-07',
      'project-doc-06',
      'project-doc-05',
      'project-doc-04',
      'job-01',
    ]);
    expect(workspace.activity.items[0]).toMatchObject({
      href: '/projects/project-activity/writing/project-doc-10',
      kind: 'project-doc',
      occurredAt: '2026-05-18T00:10:30.000Z',
      projectId: 'project-activity',
      sourceLabel: 'Project Doc',
      summary: 'Project Doc review · version 10',
      title: 'Activity doc 10',
    });
    expect(workspace.activity.items[0]).not.toHaveProperty('actorUserId');
    expect(workspace.resources.totalCount).toBe(13);
    expect(workspace.resources.items[0]).toMatchObject({
      href: '/projects/project-activity/writing/project-doc-10',
      kind: 'project-doc',
      projectId: 'project-activity',
      subtitle: 'review · version 10',
      title: 'Activity doc 10',
    });
    expect(workspace.resources.items.filter((item) => item.kind === 'project-doc').map((item) => item.sourceId)).toEqual(
      documents.map((document) => document.document.id).reverse(),
    );
    expect(workspace.resources.items.some((item) => item.kind === 'library-entry')).toBe(true);
    expect(workspace.resources.items.some((item) => item.kind === 'reader-excerpt')).toBe(true);
    expect(workspace.resources.items.some((item) => item.kind === 'job')).toBe(true);
    expect(workspace.docs.canCreate).toBe(false);
    expect(workspace.docs.createDisabledReason).toMatch(/viewers can read/i);
  });
});
