import { describe, expect, it } from 'vitest';

import { createProjectWorkspaceService } from '../../src/server/services/project-workspace.service';

import type {
  PersistedProjectDocIndexItem,
  ProjectDocRepository,
  ProjectRepository,
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
  it('derives a deterministic bounded activity feed and resources from Project Docs', async () => {
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
    const service = createProjectWorkspaceService({
      projectDocRepository,
      projectRepository,
    });

    const workspace = await service.getWorkspace('project-activity', 'user-bob');

    expect(workspace.activity.totalCount).toBe(10);
    expect(workspace.activity.items).toHaveLength(8);
    expect(workspace.activity.items.map((item) => item.sourceId)).toEqual([
      'project-doc-10',
      'project-doc-09',
      'project-doc-08',
      'project-doc-07',
      'project-doc-06',
      'project-doc-05',
      'project-doc-04',
      'project-doc-03',
    ]);
    expect(workspace.activity.items[0]).toMatchObject({
      actorUserId: 'user-alice',
      href: '/projects/project-activity/writing/project-doc-10',
      kind: 'project-doc',
      occurredAt: '2026-05-18T00:10:30.000Z',
      projectId: 'project-activity',
      sourceLabel: 'Project Doc',
      summary: 'Project Doc review · version 10',
      title: 'Activity doc 10',
    });
    expect(workspace.resources.totalCount).toBe(10);
    expect(workspace.resources.items.map((item) => item.sourceId)).toEqual(
      documents.map((document) => document.document.id),
    );
    expect(workspace.resources.items[0]).toMatchObject({
      href: '/projects/project-activity/writing/project-doc-01',
      kind: 'project-doc',
      projectId: 'project-activity',
      subtitle: 'draft · version 1',
      title: 'Activity doc 1',
    });
    expect(workspace.docs.canCreate).toBe(false);
    expect(workspace.docs.createDisabledReason).toMatch(/viewers can read/i);
  });
});
