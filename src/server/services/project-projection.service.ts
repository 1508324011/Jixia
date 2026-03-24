import type { EvidenceCardRecord } from '@shared/contracts/evidence';
import type { ProjectReferenceRecord } from '@shared/contracts/writing';

import { createWorkbenchOwnershipPolicy } from './workbench-ownership.service';
import type { NotebookService } from './notebook.service';

export type CreateProjectReferenceRequest =
  | {
      actorUserId: string;
      noteId: string;
      notebookId: string;
      paperAssetId: string;
      projectId: string;
      selectedText: string;
      sourceType: 'notebook-note';
    }
  | {
      actorUserId: string;
      evidenceCardId: string;
      paperAssetId: string;
      projectId: string;
      selectedText: string;
      sourceType: 'evidence-card';
    };

export interface ProjectProjectionStore {
  evidenceCards: EvidenceCardRecord[];
  nextId(prefix: string): string;
  notebookService: NotebookService;
  persist(): void;
  projectReferences: ProjectReferenceRecord[];
}

export interface ProjectProjectionService {
  createReference(input: CreateProjectReferenceRequest): Promise<ProjectReferenceRecord>;
}

function assertSelectedText(selectedText: string): string {
  if (!selectedText.trim()) {
    throw new Error('selectedText is required.');
  }

  return selectedText.trim();
}

export function createProjectProjectionService(
  store: ProjectProjectionStore,
): ProjectProjectionService {
  const ownershipPolicy = createWorkbenchOwnershipPolicy({
    nextId(prefix: string): string {
      return store.nextId(prefix);
    },
  });

  return {
    async createReference(input) {
      if (input.sourceType === 'notebook-note') {
        const notebook = store.notebookService.getNotebook(input.notebookId);
        const note = store.notebookService.getNote(input.noteId);

        if (!notebook || notebook.ownerUserId !== input.actorUserId) {
          throw new Error('Notebook not found.');
        }

        if (!note || note.notebookId !== notebook.id) {
          throw new Error('Notebook note not found.');
        }

        if (note.paperAssetId !== input.paperAssetId) {
          throw new Error('Notebook note does not match the requested paper asset.');
        }

        const reference = ownershipPolicy.createProjectReference({
          paperAssetId: input.paperAssetId,
          projectId: input.projectId,
          selectedText: assertSelectedText(input.selectedText),
          sourceType: input.sourceType,
        });

        store.projectReferences.push(reference);
        store.persist();

        return reference;
      }

      const evidenceCard = store.evidenceCards.find(
        (candidate) => candidate.id === input.evidenceCardId,
      );

      if (!evidenceCard) {
        throw new Error('Evidence card not found.');
      }

      if (evidenceCard.paperAssetId !== input.paperAssetId) {
        throw new Error('Evidence card does not match the requested paper asset.');
      }

      const reference = ownershipPolicy.createProjectReference({
        paperAssetId: input.paperAssetId,
        projectId: input.projectId,
        selectedText: assertSelectedText(input.selectedText),
        sourceType: input.sourceType,
      });

      store.projectReferences.push(reference);
      store.persist();

      return reference;
    },
  };
}
