import type { Prisma, PrismaClient } from "@jixia/db/generated";
import {
  documentHardDeleteConfirmation,
  type DocumentDTO,
  type DocumentDraftDTO,
  type DocumentRevisionDTO,
  type DocumentStatus,
  type DocumentType,
  type EditorSnapshot,
  type ListDocumentsResponse,
  type ProjectRole,
  type SpaceRole
} from "@jixia/shared";

import {
  canArchiveDocument as defaultCanArchiveDocument,
  canEditDocument as defaultCanEditDocument,
  canHardDeleteDocument as defaultCanHardDeleteDocument,
  canReadDocument as defaultCanReadDocument,
  type PermissionService
} from "../permissions/permission.service.js";
import { ensureMetadataOnlyAuditPayload } from "../audit/audit.service.js";
import {
  createEmptyEditorSnapshot,
  EditorSchemaError,
  normalizeEditorSnapshot
} from "./editor-schema.js";

export class DocumentError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

export type DocumentActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type DocumentProjectRecord = {
  readonly id: string;
  readonly spaceId: string;
};

export type DocumentProjectMembershipRecord = {
  readonly role: ProjectRole;
};

export type DocumentRevisionRecord = {
  readonly id: string;
  readonly documentId: string;
  readonly revisionNumber: number;
  readonly contentSnapshot: EditorSnapshot;
  readonly editorUserId: string;
  readonly createdAt: Date;
};

export type DocumentRecord = {
  readonly id: string;
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
  readonly projectSpaceId: string | null;
  readonly currentRevisionId: string | null;
  readonly currentRevision: DocumentRevisionRecord | null;
  readonly revisionNumber: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type DocumentDraftRecord = {
  readonly documentId: string;
  readonly userId: string;
  readonly baseRevision: number;
  readonly draftContent: EditorSnapshot;
  readonly updatedAt: Date;
};

export type AuditEventRecord = {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata: Record<string, unknown>;
};

export type CreateDocumentRepositoryInput = {
  readonly actorUserId: string;
  readonly type: DocumentType;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
};

export type SaveDocumentRevisionRepositoryResult =
  | {
      readonly outcome: "saved";
      readonly document: DocumentRecord;
      readonly revision: DocumentRevisionRecord;
    }
  | {
      readonly outcome: "conflict";
      readonly document: DocumentRecord;
    }
  | {
      readonly outcome: "archived";
    }
  | {
      readonly outcome: "missing";
    }
  | {
      readonly outcome: "invalid-current-revision";
    };

export type HardDeleteDocumentRepositoryResult = {
  readonly documentId: string;
  readonly deletedAt: Date;
};

export type DocumentRepository = {
  readonly auditEvents: readonly AuditEventRecord[];
  readonly findProjectById: (projectId: string) => Promise<DocumentProjectRecord | null>;
  readonly findProjectMembership: (input: {
    readonly projectId: string;
    readonly userId: string;
  }) => Promise<DocumentProjectMembershipRecord | null>;
  readonly listNotebookDocuments: (ownerUserId: string) => Promise<readonly DocumentRecord[]>;
  readonly listProjectDocuments: (projectId: string) => Promise<readonly DocumentRecord[]>;
  readonly createDocument: (input: CreateDocumentRepositoryInput) => Promise<DocumentRecord>;
  readonly findDocumentById: (documentId: string) => Promise<DocumentRecord | null>;
  readonly saveDraft: (input: {
    readonly documentId: string;
    readonly userId: string;
    readonly baseRevision: number;
    readonly draftContent: EditorSnapshot;
  }) => Promise<DocumentDraftRecord>;
  readonly saveRevision: (input: {
    readonly actorUserId: string;
    readonly documentId: string;
    readonly baseRevision: number;
    readonly contentSnapshot: EditorSnapshot;
    readonly title?: string;
  }) => Promise<SaveDocumentRevisionRepositoryResult>;
  readonly archiveDocument: (input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }) => Promise<DocumentRecord | null>;
  readonly restoreDocument: (input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }) => Promise<DocumentRecord | null>;
  readonly hardDeleteDocument: (input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }) => Promise<HardDeleteDocumentRepositoryResult | null>;
};

export type ReadDocumentResponse = {
  readonly document: DocumentDTO;
  readonly revision: DocumentRevisionDTO | null;
  readonly currentSnapshot: EditorSnapshot;
};

export type CreateDocumentServiceResponse = ReadDocumentResponse;

export type SaveDocumentDraftServiceResponse = {
  readonly draft: DocumentDraftDTO;
};

export type SaveDocumentRevisionServiceResponse =
  | {
      readonly outcome: "saved";
      readonly document: DocumentDTO;
      readonly revision: DocumentRevisionDTO;
    }
  | {
      readonly outcome: "conflict";
      readonly documentId: string;
      readonly currentRevisionNumber: number;
      readonly currentSnapshot: EditorSnapshot;
      readonly submittedBaseRevision: number;
      readonly submittedSnapshot: EditorSnapshot;
    };

export type DocumentLifecycleServiceResponse = {
  readonly document: DocumentDTO;
};

export type HardDeleteDocumentServiceResponse = {
  readonly documentId: string;
  readonly deletedAt: string;
};

const projectEditorRoles = new Set<ProjectRole>(["ProjectOwner", "ProjectEditor"]);

function badRequest(message = "Invalid request"): DocumentError {
  return new DocumentError(message, 400);
}

function forbidden(message = "Forbidden"): DocumentError {
  return new DocumentError(message, 403);
}

function notFound(message = "Not found"): DocumentError {
  return new DocumentError(message, 404);
}

function conflict(message = "Resource conflict"): DocumentError {
  return new DocumentError(message, 409);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function toInputJson(snapshot: EditorSnapshot): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

function normalizeStoredSnapshot(value: unknown): EditorSnapshot {
  return normalizeEditorSnapshot(value);
}

function normalizeSubmittedSnapshot(value: unknown): EditorSnapshot {
  try {
    return normalizeEditorSnapshot(value);
  } catch (error) {
    if (error instanceof EditorSchemaError) {
      throw badRequest(error.message);
    }

    throw error;
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "P2002"
  );
}

function ensureValidBaseRevision(baseRevision: number): void {
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    throw badRequest("Invalid base revision");
  }
}

function ensureValidTitle(title: string): string {
  const trimmedTitle = title.trim();

  if (!trimmedTitle || trimmedTitle.length > 200) {
    throw badRequest("Invalid document title");
  }

  return trimmedTitle;
}

function ensureAuditMetadata(metadata: Record<string, unknown>): void {
  ensureMetadataOnlyAuditPayload(metadata);
}

function isValidDocumentContext(document: DocumentRecord): boolean {
  if (document.type === "notebook") {
    return (
      document.ownerUserId !== null &&
      document.projectId === null &&
      document.projectSpaceId === null
    );
  }

  if (document.type === "project") {
    return (
      document.ownerUserId === null &&
      document.projectId !== null &&
      document.projectSpaceId !== null
    );
  }

  return false;
}

function ensureDocumentInActorScope(document: DocumentRecord | null, actor: DocumentActor): DocumentRecord {
  if (!document || !isValidDocumentContext(document)) {
    throw notFound();
  }

  if (document.type === "project" && document.projectSpaceId !== actor.spaceId) {
    throw notFound();
  }

  return document;
}

function currentSnapshotForDocument(document: DocumentRecord): EditorSnapshot {
  if (!Number.isInteger(document.revisionNumber) || document.revisionNumber < 0) {
    throw notFound();
  }

  if (document.revisionNumber === 0) {
    if (document.currentRevisionId === null && document.currentRevision === null) {
      return createEmptyEditorSnapshot();
    }

    throw notFound();
  }

  if (!document.currentRevisionId || !document.currentRevision) {
    throw notFound();
  }

  if (
    document.currentRevision.id === document.currentRevisionId &&
    document.currentRevision.documentId === document.id &&
    document.currentRevision.revisionNumber === document.revisionNumber
  ) {
    return document.currentRevision.contentSnapshot;
  }

  throw notFound();
}

async function failClosedStoredSnapshot<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof EditorSchemaError) {
      throw notFound();
    }

    throw error;
  }
}

function saveRevisionConflictFromDocument(document: DocumentRecord): SaveDocumentRevisionRepositoryResult {
  if (!isValidDocumentContext(document)) {
    return { outcome: "invalid-current-revision" };
  }

  if (document.status !== "active") {
    return { outcome: "archived" };
  }

  try {
    currentSnapshotForDocument(document);
  } catch {
    return { outcome: "invalid-current-revision" };
  }

  return { outcome: "conflict", document };
}

function toDocumentDTO(document: DocumentRecord): DocumentDTO {
  return {
    id: document.id,
    type: document.type,
    status: document.status,
    title: document.title,
    ownerUserId: document.ownerUserId,
    projectId: document.projectId,
    currentRevisionId: document.currentRevisionId,
    revisionNumber: document.revisionNumber,
    createdAt: toIsoString(document.createdAt),
    updatedAt: toIsoString(document.updatedAt)
  };
}

function toRevisionDTO(revision: DocumentRevisionRecord): DocumentRevisionDTO {
  return {
    id: revision.id,
    documentId: revision.documentId,
    revisionNumber: revision.revisionNumber,
    contentSnapshot: revision.contentSnapshot,
    editorUserId: revision.editorUserId,
    createdAt: toIsoString(revision.createdAt)
  };
}

function toDraftDTO(draft: DocumentDraftRecord): DocumentDraftDTO {
  return {
    documentId: draft.documentId,
    userId: draft.userId,
    baseRevision: draft.baseRevision,
    draftContent: draft.draftContent,
    updatedAt: toIsoString(draft.updatedAt)
  };
}

function toReadDocumentResponse(document: DocumentRecord): ReadDocumentResponse {
  return {
    document: toDocumentDTO(document),
    revision: document.currentRevision ? toRevisionDTO(document.currentRevision) : null,
    currentSnapshot: currentSnapshotForDocument(document)
  };
}

function toRevisionRecord(record: {
  readonly id: string;
  readonly documentId: string;
  readonly revisionNumber: number;
  readonly contentSnapshot: unknown;
  readonly editorUserId: string;
  readonly createdAt: Date;
}): DocumentRevisionRecord {
  return {
    id: record.id,
    documentId: record.documentId,
    revisionNumber: record.revisionNumber,
    contentSnapshot: normalizeStoredSnapshot(record.contentSnapshot),
    editorUserId: record.editorUserId,
    createdAt: record.createdAt
  };
}

function toDocumentRecord(record: {
  readonly id: string;
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
  readonly currentRevisionId: string | null;
  readonly revisionNumber: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly project: { readonly spaceId: string } | null;
  readonly currentRevision: {
    readonly id: string;
    readonly documentId: string;
    readonly revisionNumber: number;
    readonly contentSnapshot: unknown;
    readonly editorUserId: string;
    readonly createdAt: Date;
  } | null;
}): DocumentRecord {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    title: record.title,
    ownerUserId: record.ownerUserId,
    projectId: record.projectId,
    projectSpaceId: record.project?.spaceId ?? null,
    currentRevisionId: record.currentRevisionId,
    currentRevision: record.currentRevision ? toRevisionRecord(record.currentRevision) : null,
    revisionNumber: record.revisionNumber,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toDocumentListRecord(record: {
  readonly id: string;
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
  readonly currentRevisionId: string | null;
  readonly revisionNumber: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly project: { readonly spaceId: string } | null;
}): DocumentRecord {
  return {
    id: record.id,
    type: record.type,
    status: record.status,
    title: record.title,
    ownerUserId: record.ownerUserId,
    projectId: record.projectId,
    projectSpaceId: record.project?.spaceId ?? null,
    currentRevisionId: record.currentRevisionId,
    currentRevision: null,
    revisionNumber: record.revisionNumber,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toDraftRecord(record: {
  readonly documentId: string;
  readonly userId: string;
  readonly baseRevision: number;
  readonly draftContent: unknown;
  readonly updatedAt: Date;
}): DocumentDraftRecord {
  return {
    documentId: record.documentId,
    userId: record.userId,
    baseRevision: record.baseRevision,
    draftContent: normalizeStoredSnapshot(record.draftContent),
    updatedAt: record.updatedAt
  };
}

const revisionSelect = {
  id: true,
  documentId: true,
  revisionNumber: true,
  contentSnapshot: true,
  editorUserId: true,
  createdAt: true
} satisfies Prisma.DocumentRevisionSelect;

const documentSelect = {
  id: true,
  type: true,
  status: true,
  title: true,
  ownerUserId: true,
  projectId: true,
  currentRevisionId: true,
  revisionNumber: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: {
      spaceId: true
    }
  },
  currentRevision: {
    select: revisionSelect
  }
} satisfies Prisma.DocumentSelect;

const documentListSelect = {
  id: true,
  type: true,
  status: true,
  title: true,
  ownerUserId: true,
  projectId: true,
  currentRevisionId: true,
  revisionNumber: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: {
      spaceId: true
    }
  }
} satisfies Prisma.DocumentSelect;

const draftSelect = {
  documentId: true,
  userId: true,
  baseRevision: true,
  draftContent: true,
  updatedAt: true
} satisfies Prisma.DocumentDraftSelect;

type PrismaTransaction = Prisma.TransactionClient;

export class PrismaDocumentRepository implements DocumentRepository {
  readonly auditEvents: readonly AuditEventRecord[] = [];

  constructor(private readonly prisma: PrismaClient) {}

  async findProjectById(projectId: string): Promise<DocumentProjectRecord | null> {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        spaceId: true
      }
    });
  }

  async findProjectMembership(input: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<DocumentProjectMembershipRecord | null> {
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: input.projectId,
          userId: input.userId
        }
      },
      select: { role: true }
    });

    return membership ? { role: membership.role as ProjectRole } : null;
  }

  async createDocument(input: CreateDocumentRepositoryInput): Promise<DocumentRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const document = await transaction.document.create({
        data: {
          type: input.type,
          status: "active",
          title: input.title,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          currentRevisionId: null,
          revisionNumber: 0
        },
        select: documentSelect
      });

      await this.writeAuditEvent(transaction, {
        actorUserId: input.actorUserId,
        action: "document.created",
        targetType: "Document",
        targetId: document.id,
        metadata: {
          documentId: document.id,
          documentType: input.type,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          revisionNumber: 0
        }
      });

      return toDocumentRecord(document);
    });
  }

  async listNotebookDocuments(ownerUserId: string): Promise<readonly DocumentRecord[]> {
    const documents = await this.prisma.document.findMany({
      where: {
        type: "notebook",
        ownerUserId,
        projectId: null
      },
      orderBy: { updatedAt: "desc" },
      select: documentListSelect
    });

    return documents.map(toDocumentListRecord);
  }

  async listProjectDocuments(projectId: string): Promise<readonly DocumentRecord[]> {
    const documents = await this.prisma.document.findMany({
      where: {
        type: "project",
        projectId,
        ownerUserId: null
      },
      orderBy: { updatedAt: "desc" },
      select: documentListSelect
    });

    return documents.map(toDocumentListRecord);
  }

  async findDocumentById(documentId: string): Promise<DocumentRecord | null> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: documentSelect
    });

    return document ? toDocumentRecord(document) : null;
  }

  async saveDraft(input: {
    readonly documentId: string;
    readonly userId: string;
    readonly baseRevision: number;
    readonly draftContent: EditorSnapshot;
  }): Promise<DocumentDraftRecord> {
    const draft = await this.prisma.documentDraft.upsert({
      where: {
        documentId_userId: {
          documentId: input.documentId,
          userId: input.userId
        }
      },
      create: {
        documentId: input.documentId,
        userId: input.userId,
        baseRevision: input.baseRevision,
        draftContent: toInputJson(input.draftContent)
      },
      update: {
        baseRevision: input.baseRevision,
        draftContent: toInputJson(input.draftContent)
      },
      select: draftSelect
    });

    return toDraftRecord(draft);
  }

  async saveRevision(input: {
    readonly actorUserId: string;
    readonly documentId: string;
    readonly baseRevision: number;
    readonly contentSnapshot: EditorSnapshot;
    readonly title?: string;
  }): Promise<SaveDocumentRevisionRepositoryResult> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const currentDocument = await transaction.document.findUnique({
          where: { id: input.documentId },
          select: documentSelect
        });

        if (!currentDocument) {
          return { outcome: "missing" };
        }

        const document = toDocumentRecord(currentDocument);

        if (!isValidDocumentContext(document)) {
          return { outcome: "invalid-current-revision" };
        }

        if (document.status !== "active") {
          return { outcome: "archived" };
        }

        try {
          currentSnapshotForDocument(document);
        } catch {
          return { outcome: "invalid-current-revision" };
        }

        if (document.revisionNumber !== input.baseRevision) {
          return { outcome: "conflict", document };
        }

        const nextRevisionNumber = document.revisionNumber + 1;
        const revision = await transaction.documentRevision.create({
          data: {
            documentId: input.documentId,
            revisionNumber: nextRevisionNumber,
            contentSnapshot: toInputJson(input.contentSnapshot),
            editorUserId: input.actorUserId
          },
          select: revisionSelect
        });
        const updateData: Prisma.DocumentUpdateInput = {
          currentRevision: { connect: { id: revision.id } },
          revisionNumber: nextRevisionNumber
        };

        if (input.title !== undefined) {
          updateData.title = input.title;
        }

        const updatedDocument = await transaction.document.update({
          where: { id: input.documentId },
          data: updateData,
          select: documentSelect
        });

        await transaction.documentDraft.deleteMany({
          where: {
            documentId: input.documentId,
            userId: input.actorUserId
          }
        });
        await this.writeAuditEvent(transaction, {
          actorUserId: input.actorUserId,
          action: "document_revision.saved",
          targetType: "DocumentRevision",
          targetId: revision.id,
          metadata: {
            documentId: input.documentId,
            revisionId: revision.id,
            revisionNumber: nextRevisionNumber,
            editorUserId: input.actorUserId
          }
        });

        return {
          outcome: "saved",
          document: toDocumentRecord(updatedDocument),
          revision: toRevisionRecord(revision)
        };
      });
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const currentDocument = await this.prisma.document.findUnique({
        where: { id: input.documentId },
        select: documentSelect
      });

      if (!currentDocument) {
        return { outcome: "missing" };
      }

      return saveRevisionConflictFromDocument(toDocumentRecord(currentDocument));
    }
  }

  async archiveDocument(input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }): Promise<DocumentRecord | null> {
    return this.updateDocumentStatusWithAudit(input, "archived", "document.archived");
  }

  async restoreDocument(input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }): Promise<DocumentRecord | null> {
    return this.updateDocumentStatusWithAudit(input, "active", "document.restored");
  }

  async hardDeleteDocument(input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }): Promise<HardDeleteDocumentRepositoryResult | null> {
    return this.prisma.$transaction(async (transaction) => {
      const currentDocument = await transaction.document.findUnique({
        where: { id: input.documentId },
        select: documentSelect
      });

      if (!currentDocument) {
        return null;
      }

      const document = toDocumentRecord(currentDocument);

      await transaction.document.update({
        where: { id: input.documentId },
        data: { currentRevision: { disconnect: true } },
        select: { id: true }
      });
      const deletedAttachments = await transaction.documentAttachment.deleteMany({
        where: { documentId: input.documentId }
      });
      const deletedDrafts = await transaction.documentDraft.deleteMany({
        where: { documentId: input.documentId }
      });
      const deletedRevisions = await transaction.documentRevision.deleteMany({
        where: { documentId: input.documentId }
      });

      await transaction.document.delete({ where: { id: input.documentId } });

      const deletedAt = new Date();
      await this.writeAuditEvent(transaction, {
        actorUserId: input.actorUserId,
        action: "document.hard_deleted",
        targetType: "Document",
        targetId: input.documentId,
        metadata: {
          documentId: input.documentId,
          documentType: document.type,
          ownerUserId: document.ownerUserId,
          projectId: document.projectId,
          revisionNumber: document.revisionNumber,
          deletedDraftCount: deletedDrafts.count,
          deletedRevisionCount: deletedRevisions.count,
          deletedAttachmentCount: deletedAttachments.count
        }
      });

      return { documentId: input.documentId, deletedAt };
    });
  }

  private async updateDocumentStatusWithAudit(
    input: { readonly actorUserId: string; readonly documentId: string },
    status: DocumentStatus,
    action: string
  ): Promise<DocumentRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const currentDocument = await transaction.document.findUnique({
        where: { id: input.documentId },
        select: documentSelect
      });

      if (!currentDocument) {
        return null;
      }

      const previousDocument = toDocumentRecord(currentDocument);
      const updatedDocument = await transaction.document.update({
        where: { id: input.documentId },
        data: { status },
        select: documentSelect
      });

      await this.writeAuditEvent(transaction, {
        actorUserId: input.actorUserId,
        action,
        targetType: "Document",
        targetId: input.documentId,
        metadata: {
          documentId: input.documentId,
          documentType: previousDocument.type,
          previousStatus: previousDocument.status,
          nextStatus: status,
          ownerUserId: previousDocument.ownerUserId,
          projectId: previousDocument.projectId,
          revisionNumber: previousDocument.revisionNumber
        }
      });

      return toDocumentRecord(updatedDocument);
    });
  }

  private async writeAuditEvent(
    transaction: PrismaTransaction,
    event: AuditEventRecord & { readonly actorUserId: string }
  ): Promise<void> {
    ensureAuditMetadata(event.metadata);

    await transaction.auditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata as Prisma.InputJsonValue
      }
    });
  }
}

export function createDocumentService(
  repository: DocumentRepository,
  permissions: Pick<
    PermissionService,
    "canReadDocument" | "canEditDocument" | "canArchiveDocument" | "canHardDeleteDocument"
  >
) {
  async function requireReadableDocument(
    actor: DocumentActor,
    documentId: string
  ): Promise<DocumentRecord> {
    const document = ensureDocumentInActorScope(
      await failClosedStoredSnapshot(() => repository.findDocumentById(documentId)),
      actor
    );

    if (!(await permissions.canReadDocument(actor.userId, document.id))) {
      throw notFound();
    }

    currentSnapshotForDocument(document);
    return document;
  }

  async function requireScopedDocument(
    actor: DocumentActor,
    documentId: string
  ): Promise<DocumentRecord> {
    return ensureDocumentInActorScope(
      await failClosedStoredSnapshot(() => repository.findDocumentById(documentId)),
      actor
    );
  }

  async function ensureEditableDocument(
    actor: DocumentActor,
    document: DocumentRecord
  ): Promise<void> {
    if (document.status !== "active") {
      if (await permissions.canReadDocument(actor.userId, document.id)) {
        throw conflict("Document is archived");
      }

      throw forbidden();
    }

    if (await permissions.canEditDocument(actor.userId, document.id)) {
      return;
    }

    throw forbidden();
  }

  async function ensureLifecycleDocument(
    actor: DocumentActor,
    documentId: string,
    action: "archive" | "hard-delete"
  ): Promise<DocumentRecord> {
    const document = await requireScopedDocument(actor, documentId);
    const allowed =
      action === "archive"
        ? await permissions.canArchiveDocument(actor.userId, document.id)
        : await permissions.canHardDeleteDocument(actor.userId, document.id);

    if (!allowed) {
      throw forbidden();
    }

    return document;
  }

  async function canActorReadListedDocument(actor: DocumentActor, document: DocumentRecord): Promise<boolean> {
    try {
      return await permissions.canReadDocument(actor.userId, document.id);
    } catch {
      return false;
    }
  }

  async function listNotebookDocumentsResponse(
    documents: readonly DocumentRecord[],
    actor: DocumentActor
  ): Promise<ListDocumentsResponse> {
    const readableDocuments: DocumentDTO[] = [];

    for (const document of documents) {
      if (!isValidDocumentContext(document)) {
        continue;
      }

      if (document.type !== "notebook" || document.ownerUserId !== actor.userId) {
        continue;
      }

      if (await canActorReadListedDocument(actor, document)) {
        readableDocuments.push(toDocumentDTO(document));
      }
    }

    return {
      documents: readableDocuments
    };
  }

  async function listProjectDocumentsResponse(
    documents: readonly DocumentRecord[],
    actor: DocumentActor,
    projectId: string
  ): Promise<ListDocumentsResponse> {
    const readableDocuments: DocumentDTO[] = [];

    for (const document of documents) {
      if (!isValidDocumentContext(document)) {
        continue;
      }

      if (
        document.type !== "project" ||
        document.projectId !== projectId ||
        document.projectSpaceId !== actor.spaceId
      ) {
        continue;
      }

      if (await canActorReadListedDocument(actor, document)) {
        readableDocuments.push(toDocumentDTO(document));
      }
    }

    return {
      documents: readableDocuments
    };
  }

  return {
    async listNotebookDocuments(actor: DocumentActor): Promise<ListDocumentsResponse> {
      const documents = await failClosedStoredSnapshot(() => repository.listNotebookDocuments(actor.userId));
      return listNotebookDocumentsResponse(documents, actor);
    },

    async listProjectDocuments(input: {
      readonly actor: DocumentActor;
      readonly projectId: string;
    }): Promise<ListDocumentsResponse> {
      const project = await repository.findProjectById(input.projectId);

      if (!project || project.spaceId !== input.actor.spaceId) {
        throw notFound();
      }

      const membership = await repository.findProjectMembership({
        projectId: project.id,
        userId: input.actor.userId
      });

      if (!membership) {
        throw notFound();
      }

      const documents = await failClosedStoredSnapshot(() => repository.listProjectDocuments(project.id));
      return listProjectDocumentsResponse(documents, input.actor, project.id);
    },

    async createNotebookDocument(input: {
      readonly actor: DocumentActor;
      readonly title: string;
    }): Promise<CreateDocumentServiceResponse> {
      const title = ensureValidTitle(input.title);
      const document = await repository.createDocument({
        actorUserId: input.actor.userId,
        type: "notebook",
        title,
        ownerUserId: input.actor.userId,
        projectId: null
      });

      return toReadDocumentResponse(document);
    },

    async createProjectDocument(input: {
      readonly actor: DocumentActor;
      readonly projectId: string;
      readonly title: string;
    }): Promise<CreateDocumentServiceResponse> {
      const title = ensureValidTitle(input.title);
      const project = await repository.findProjectById(input.projectId);

      if (!project || project.spaceId !== input.actor.spaceId) {
        throw notFound();
      }

      const membership = await repository.findProjectMembership({
        projectId: project.id,
        userId: input.actor.userId
      });

      if (!membership || !projectEditorRoles.has(membership.role)) {
        throw forbidden("ProjectOwner or ProjectEditor role required");
      }

      const document = await repository.createDocument({
        actorUserId: input.actor.userId,
        type: "project",
        title,
        ownerUserId: null,
        projectId: project.id
      });

      return toReadDocumentResponse(document);
    },

    async readDocument(actor: DocumentActor, documentId: string): Promise<ReadDocumentResponse> {
      return toReadDocumentResponse(await requireReadableDocument(actor, documentId));
    },

    async saveDraft(input: {
      readonly actor: DocumentActor;
      readonly documentId: string;
      readonly baseRevision: number;
      readonly draftContent: unknown;
    }): Promise<SaveDocumentDraftServiceResponse> {
      ensureValidBaseRevision(input.baseRevision);
      const draftContent = normalizeSubmittedSnapshot(input.draftContent);
      const document = await requireScopedDocument(input.actor, input.documentId);
      currentSnapshotForDocument(document);
      await ensureEditableDocument(input.actor, document);

      const draft = await repository.saveDraft({
        documentId: document.id,
        userId: input.actor.userId,
        baseRevision: input.baseRevision,
        draftContent
      });

      return { draft: toDraftDTO(draft) };
    },

    async saveRevision(input: {
      readonly actor: DocumentActor;
      readonly documentId: string;
      readonly baseRevision: number;
      readonly contentSnapshot: unknown;
      readonly title?: string;
    }): Promise<SaveDocumentRevisionServiceResponse> {
      ensureValidBaseRevision(input.baseRevision);
      const contentSnapshot = normalizeSubmittedSnapshot(input.contentSnapshot);
      const title = input.title === undefined ? undefined : ensureValidTitle(input.title);
      const document = await requireScopedDocument(input.actor, input.documentId);
      currentSnapshotForDocument(document);
      await ensureEditableDocument(input.actor, document);

      const result = await failClosedStoredSnapshot(() =>
        repository.saveRevision({
          actorUserId: input.actor.userId,
          documentId: document.id,
          baseRevision: input.baseRevision,
          contentSnapshot,
          ...(title === undefined ? {} : { title })
        })
      );

      switch (result.outcome) {
        case "saved":
          return {
            outcome: "saved",
            document: toDocumentDTO(result.document),
            revision: toRevisionDTO(result.revision)
          };
        case "conflict":
          return {
            outcome: "conflict",
            documentId: result.document.id,
            currentRevisionNumber: result.document.revisionNumber,
            currentSnapshot: currentSnapshotForDocument(result.document),
            submittedBaseRevision: input.baseRevision,
            submittedSnapshot: contentSnapshot
          };
        case "archived":
          throw conflict("Document is archived");
        case "missing":
        case "invalid-current-revision":
          throw notFound();
      }
    },

    async archiveDocument(input: {
      readonly actor: DocumentActor;
      readonly documentId: string;
    }): Promise<DocumentLifecycleServiceResponse> {
      const document = await ensureLifecycleDocument(input.actor, input.documentId, "archive");
      const updatedDocument = await failClosedStoredSnapshot(() =>
        repository.archiveDocument({
          actorUserId: input.actor.userId,
          documentId: document.id
        })
      );

      return { document: toDocumentDTO(ensureDocumentInActorScope(updatedDocument, input.actor)) };
    },

    async restoreDocument(input: {
      readonly actor: DocumentActor;
      readonly documentId: string;
    }): Promise<DocumentLifecycleServiceResponse> {
      const document = await ensureLifecycleDocument(input.actor, input.documentId, "archive");
      const updatedDocument = await failClosedStoredSnapshot(() =>
        repository.restoreDocument({
          actorUserId: input.actor.userId,
          documentId: document.id
        })
      );

      return { document: toDocumentDTO(ensureDocumentInActorScope(updatedDocument, input.actor)) };
    },

    async hardDeleteDocument(input: {
      readonly actor: DocumentActor;
      readonly documentId: string;
      readonly confirmation: string;
    }): Promise<HardDeleteDocumentServiceResponse> {
      if (input.confirmation !== documentHardDeleteConfirmation) {
        throw badRequest("Invalid hard-delete confirmation");
      }

      const document = await ensureLifecycleDocument(input.actor, input.documentId, "hard-delete");
      const result = await failClosedStoredSnapshot(() =>
        repository.hardDeleteDocument({
          actorUserId: input.actor.userId,
          documentId: document.id
        })
      );

      if (!result) {
        throw notFound();
      }

      return {
        documentId: result.documentId,
        deletedAt: toIsoString(result.deletedAt)
      };
    }
  };
}

export type DocumentService = ReturnType<typeof createDocumentService>;

let cachedService: DocumentService | undefined;

export async function getDefaultDocumentService(): Promise<DocumentService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createDocumentService(new PrismaDocumentRepository(prisma), {
      canReadDocument: defaultCanReadDocument,
      canEditDocument: defaultCanEditDocument,
      canArchiveDocument: defaultCanArchiveDocument,
      canHardDeleteDocument: defaultCanHardDeleteDocument
    });
  }

  return cachedService;
}
