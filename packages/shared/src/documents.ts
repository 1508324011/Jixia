export const documentTypes = ["notebook", "project"] as const;
export type DocumentType = (typeof documentTypes)[number];

export const documentStatuses = ["active", "archived"] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export const editorBlockTypes = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "todo",
  "quote",
  "callout",
  "codeBlock",
  "divider",
  "table",
  "image",
  "file"
] as const;
export type EditorBlockType = (typeof editorBlockTypes)[number];

export const currentEditorSchemaVersion = 1 as const;
export const minimumSupportedEditorSchemaVersion = 1 as const;

export const documentSaveOutcomes = ["saved", "conflict"] as const;
export type DocumentSaveOutcome = (typeof documentSaveOutcomes)[number];

export const documentHardDeleteConfirmation = "hard-delete-document" as const;

export type EditorBlockAttributes = Readonly<Record<string, unknown>>;

export type EditorBlock = {
  readonly id: string;
  readonly type: EditorBlockType;
  readonly attrs?: EditorBlockAttributes;
  readonly content?: readonly EditorBlock[];
  readonly text?: string;
  readonly attachmentId?: string;
};

export type EditorSnapshot = {
  readonly editorSchemaVersion: typeof currentEditorSchemaVersion;
  readonly blocks: readonly EditorBlock[];
};

export const emptyEditorSnapshot: EditorSnapshot = {
  editorSchemaVersion: currentEditorSchemaVersion,
  blocks: [
    {
      id: "root-paragraph",
      type: "paragraph",
      content: []
    }
  ]
};

export type DocumentDTO = {
  readonly id: string;
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
  readonly currentRevisionId: string | null;
  readonly revisionNumber: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type DocumentRevisionDTO = {
  readonly id: string;
  readonly documentId: string;
  readonly revisionNumber: number;
  readonly contentSnapshot: EditorSnapshot;
  readonly editorUserId: string;
  readonly createdAt: string;
};

export type DocumentDraftDTO = {
  readonly documentId: string;
  readonly userId: string;
  readonly baseRevision: number;
  readonly draftContent: EditorSnapshot;
  readonly updatedAt: string;
};

export type CreateNotebookDocumentRequest = {
  readonly title: string;
  readonly initialSnapshot?: EditorSnapshot;
};

export type CreateProjectDocumentRequest = {
  readonly projectId: string;
  readonly title: string;
  readonly initialSnapshot?: EditorSnapshot;
};

export type CreateDocumentResponse = {
  readonly document: DocumentDTO;
  readonly revision: DocumentRevisionDTO | null;
};

export type ListDocumentsResponse = {
  readonly documents: readonly DocumentDTO[];
};

export type SaveDocumentDraftRequest = {
  readonly documentId: string;
  readonly baseRevision: number;
  readonly draftContent: EditorSnapshot;
};

export type SaveDocumentDraftResponse = {
  readonly draft: DocumentDraftDTO;
};

export type SaveDocumentRevisionRequest = {
  readonly documentId: string;
  readonly baseRevision: number;
  readonly contentSnapshot: EditorSnapshot;
  readonly title?: string;
};

export type SaveDocumentRevisionSuccessResponse = {
  readonly outcome: "saved";
  readonly document: DocumentDTO;
  readonly revision: DocumentRevisionDTO;
};

export type SaveDocumentRevisionConflictResponse = {
  readonly outcome: "conflict";
  readonly documentId: string;
  readonly currentRevisionNumber: number;
  readonly currentSnapshot: EditorSnapshot;
  readonly submittedBaseRevision: number;
  readonly submittedSnapshot: EditorSnapshot;
};

export type SaveDocumentRevisionResponse =
  | SaveDocumentRevisionSuccessResponse
  | SaveDocumentRevisionConflictResponse;

export type ArchiveDocumentRequest = {
  readonly documentId: string;
};

export type RestoreDocumentRequest = {
  readonly documentId: string;
};

export type HardDeleteDocumentRequest = {
  readonly documentId: string;
  readonly confirmation: typeof documentHardDeleteConfirmation;
};

export type DocumentLifecycleResponse = {
  readonly document: DocumentDTO;
};

export type HardDeleteDocumentResponse = {
  readonly documentId: string;
  readonly deletedAt: string;
};

export function isSupportedEditorBlockType(value: string): value is EditorBlockType {
  return (editorBlockTypes as readonly string[]).includes(value);
}
