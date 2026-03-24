import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';
import { createWorkbenchOwnershipPolicy } from '../../src/server/services/workbench-ownership.service';

describe('workbench ownership boundaries', () => {
  it('freezes imported-inventory-only reading and project-owned projection', () => {
    const policy = createWorkbenchOwnershipPolicy();

    expect(policy.canEnterReader({ objectType: 'external-candidate' })).toBe(false);
    expect(policy.canEnterReader({ objectType: 'library-entry' })).toBe(true);

    const projection = policy.createProjectReference({
      paperAssetId: 'asset-1',
      projectId: 'project-1',
      selectedText: 'Important excerpt',
      sourceType: 'notebook-note',
    });

    expect(projection.ownerType).toBe('project');
    expect(projection.sourceKind).toBe('projection');
    expect(projection.paperAssetId).toBe('asset-1');
    expect(projection.projectId).toBe('project-1');
    expect(projection).not.toHaveProperty('notebookBody');
  });

  it('persists notebook and project-reference state buckets', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-ownership-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });

      await app.spaces.createSpace({ kind: 'shared', name: 'Ownership Review' }, 'user-alice');

      const persistedState = JSON.parse(
        readFileSync(join(storageRoot, 'server-state.json'), 'utf8'),
      ) as {
        notebookNotes?: unknown[];
        notebookRecords?: unknown[];
        projectReferences?: unknown[];
      };

      expect(persistedState.notebookRecords).toEqual([]);
      expect(persistedState.notebookNotes).toEqual([]);
      expect(persistedState.projectReferences).toEqual([]);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
