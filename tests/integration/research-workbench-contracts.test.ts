import { describe, expect, it } from 'vitest';

import type {
  NotebookQuestionRecord,
  NotebookRecord,
} from '../../src/shared/contracts/notebook';
import type { ProjectReferenceRecord } from '../../src/shared/contracts/writing';

describe('research workbench contracts', () => {
  it('exports truthful transport-safe workbench contracts', () => {
    const notebook: NotebookRecord = {
      id: 'notebook-1',
      ownerUserId: 'user-alice',
      paperAssetId: 'asset-1',
      visibility: 'private',
    };
    const question: NotebookQuestionRecord = {
      createdAt: '2026-03-24T00:00:00.000Z',
      id: 'question-1',
      notebookId: notebook.id,
      paperAssetId: 'asset-1',
      prompt: 'What is the key evidence?',
    };
    const reference: ProjectReferenceRecord = {
      createdAt: '2026-03-24T00:00:00.000Z',
      id: 'reference-1',
      ownerType: 'project',
      paperAssetId: 'asset-1',
      projectId: 'project-1',
      selectedText: 'Important excerpt',
      sourceKind: 'projection',
      sourceType: 'notebook-note',
    };

    expect(notebook.visibility).toBe('private');
    expect(question.notebookId).toBe(notebook.id);
    expect(reference.ownerType).toBe('project');
    expect(reference.sourceKind).toBe('projection');
  });
});
