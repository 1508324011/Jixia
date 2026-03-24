import type { EvidenceCardRecord } from '@shared/contracts/evidence';
import type { SpaceMembership } from '@shared/contracts/spaces';
import type { ProjectReferenceRecord, WritingDocRecord } from '@shared/contracts/writing';

import { createWorkbenchOwnershipPolicy } from './workbench-ownership.service';
import type { NotebookService } from './notebook.service';

export type CreateProjectReferenceRequest =
  | {
      actorSpaceId: string;
      actorUserId: string;
      docId: string;
      noteId: string;
      notebookId: string;
      paperAssetId: string;
      projectId: string;
      selectedText: string;
      sourceType: 'notebook-note';
    }
  | {
      actorSpaceId: string;
      actorUserId: string;
      docId: string;
      evidenceCardId: string;
      paperAssetId: string;
      projectId: string;
      selectedText: string;
      sourceType: 'evidence-card';
    };

export interface ProjectProjectionStore {
  evidenceCards: EvidenceCardRecord[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  notebookService: NotebookService;
  persist(): void;
  projectReferences: ProjectReferenceRecord[];
  writingDocs: WritingDocRecord[];
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

function assertActorMembership(
  store: ProjectProjectionStore,
  actorUserId: string,
  spaceId: string,
): void {
  const actorHasMembership = store.memberships.some(
    (membership) => membership.spaceId === spaceId && membership.userId === actorUserId,
  );

  if (!actorHasMembership) {
    throw new Error('Access denied for the requested space resource.');
  }
}

function assertProjectDocument(
  store: ProjectProjectionStore,
  docId: string,
  projectId: string,
): Extract<WritingDocRecord, { ownerType: 'project' }> {
  const document = store.writingDocs.find((candidate) => candidate.id === docId);

  if (!document || document.ownerType !== 'project' || document.projectId !== projectId) {
    throw new Error('Project document not found.');
  }

  return document;
}

function assertProjectDocumentAccess(
  store: ProjectProjectionStore,
  actorSpaceId: string,
  actorUserId: string,
  document: Extract<WritingDocRecord, { ownerType: 'project' }>,
): void {
  assertActorMembership(store, actorUserId, document.spaceId);

  if (actorSpaceId !== document.spaceId) {
    throw new Error('Access denied for the requested project document.');
  }
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
      const document = assertProjectDocument(store, input.docId, input.projectId);
      assertProjectDocumentAccess(store, input.actorSpaceId, input.actorUserId, document);

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
          documentId: input.docId,
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
        documentId: input.docId,
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
