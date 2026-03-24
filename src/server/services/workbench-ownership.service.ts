import type {
  ProjectReferenceRecord,
  ProjectReferenceSourceType,
} from '@shared/contracts/writing';

export type ReaderObjectType = 'external-candidate' | 'library-entry';

export interface ReaderEntryRequest {
  objectType: ReaderObjectType;
}

export interface CreateProjectReferenceInput {
  documentId: string;
  paperAssetId: string;
  projectId: string;
  selectedText: string;
  sourceType: ProjectReferenceSourceType;
}

export interface WorkbenchOwnershipPolicy {
  canEnterReader(input: ReaderEntryRequest): boolean;
  createProjectReference(input: CreateProjectReferenceInput): ProjectReferenceRecord;
}

export interface CreateWorkbenchOwnershipPolicyOptions {
  now?: () => string;
  nextId?: (prefix: string) => string;
}

export function createWorkbenchOwnershipPolicy(
  options: CreateWorkbenchOwnershipPolicyOptions = {},
): WorkbenchOwnershipPolicy {
  const now = options.now ?? (() => new Date().toISOString());
  const nextId = options.nextId ?? ((prefix: string) => `${prefix}-seed`);

  return {
    canEnterReader(input) {
      return input.objectType === 'library-entry';
    },
    createProjectReference(input) {
      return {
        createdAt: now(),
        documentId: input.documentId,
        id: nextId('project-reference'),
        ownerType: 'project',
        paperAssetId: input.paperAssetId,
        projectId: input.projectId,
        selectedText: input.selectedText,
        sourceKind: 'projection',
        sourceType: input.sourceType,
      };
    },
  };
}
