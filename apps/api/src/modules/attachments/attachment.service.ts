import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@jixia/db/generated";
import {
  attachmentDownloadUrlExpiresInSeconds,
  attachmentUploadLimitsByBlockType,
  attachmentBlockTypes,
  maxUploadFailureDetailLength,
  uploadIntentExpiresInSeconds,
  type AttachmentBlockType,
  type AttachmentDownloadResponse,
  type AttachmentMetadataDTO,
  type ConfirmUploadIntentResponse,
  type CreateUploadIntentResponse,
  type DirectUploadTarget,
  type SpaceRole,
  type UploadFailureReason,
  type UploadIntentDTO,
  type UploadIntentStatus
} from "@jixia/shared";

import {
  canDownloadAttachment as defaultCanDownloadAttachment,
  canEditDocument as defaultCanEditDocument,
  type PermissionService
} from "../permissions/permission.service.js";
import {
  getDefaultObjectStorage,
  ObjectStorageError,
  type ObjectMetadata,
  type ObjectStorage
} from "./object-storage.js";

export class AttachmentError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AttachmentError";
  }
}

export type AttachmentActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type UploadIntentRecord = {
  readonly id: string;
  readonly documentId: string;
  readonly uploaderUserId: string;
  readonly blockType: AttachmentBlockType;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly status: UploadIntentStatus;
  readonly failureReason: UploadFailureReason | null;
  readonly failureDetail: string | null;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
  readonly cleanedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AttachmentRecord = {
  readonly id: string;
  readonly documentId: string;
  readonly uploadIntentId: string | null;
  readonly uploadedByUserId: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly etag: string | null;
  readonly createdAt: Date;
};

export type ConfirmUploadIntentRepositoryResult =
  | {
      readonly outcome: "confirmed";
      readonly intent: UploadIntentRecord;
      readonly attachment: AttachmentRecord;
    }
  | {
      readonly outcome: "unavailable";
    };

export type AttachmentRepository = {
  readonly auditEvents: readonly unknown[];
  readonly createUploadIntent: (input: {
    readonly documentId: string;
    readonly uploaderUserId: string;
    readonly blockType: AttachmentBlockType;
    readonly storageKey: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly checksum: string | null;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }) => Promise<UploadIntentRecord>;
  readonly findUploadIntentById: (uploadIntentId: string) => Promise<UploadIntentRecord | null>;
  readonly confirmUploadIntent: (input: {
    readonly uploadIntentId: string;
    readonly uploaderUserId: string;
    readonly now: Date;
    readonly etag: string | null;
  }) => Promise<ConfirmUploadIntentRepositoryResult>;
  readonly markUploadIntentFailed: (input: {
    readonly uploadIntentId: string;
    readonly uploaderUserId: string;
    readonly failureReason: UploadFailureReason;
    readonly failureDetail: string;
  }) => Promise<UploadIntentRecord | null>;
  readonly findAttachmentById: (attachmentId: string) => Promise<AttachmentRecord | null>;
};

export type AttachmentServiceOptions = {
  readonly now?: () => Date;
  readonly createStorageKey?: (fileName: string) => string;
};

const blockTypeSet = new Set<AttachmentBlockType>(attachmentBlockTypes);

function badRequest(message = "Invalid request"): AttachmentError {
  return new AttachmentError(message, 400);
}

function forbidden(message = "Forbidden"): AttachmentError {
  return new AttachmentError(message, 403);
}

function notFound(message = "Not found"): AttachmentError {
  return new AttachmentError(message, 404);
}

function conflict(message = "Resource conflict"): AttachmentError {
  return new AttachmentError(message, 409);
}

function unavailable(message = "Object storage unavailable"): AttachmentError {
  return new AttachmentError(message, 503);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function trimFailureDetail(value: string): string {
  return value.slice(0, maxUploadFailureDetailLength);
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

function ensureBlockType(blockType: AttachmentBlockType): void {
  if (!blockTypeSet.has(blockType)) {
    throw badRequest("Invalid attachment block type");
  }
}

function ensureFileName(fileName: string): string {
  const trimmed = fileName.trim();

  if (!trimmed || trimmed.length > 255) {
    throw badRequest("Invalid file name");
  }

  return trimmed;
}

function ensureMimeType(mimeType: string): string {
  const normalized = normalizeMimeType(mimeType);

  if (!normalized || normalized.length > 255 || !/^[^\s/]+\/[^\s/]+$/.test(normalized)) {
    throw badRequest("Invalid MIME type");
  }

  return normalized;
}

function ensureSizeBytes(blockType: AttachmentBlockType, sizeBytes: number): void {
  const maxSizeBytes = attachmentUploadLimitsByBlockType[blockType].maxSizeBytes;

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxSizeBytes) {
    throw badRequest("Attachment size exceeds the locked upload limit");
  }
}

function normalizeChecksum(checksum: string | undefined): string | null {
  const trimmed = checksum?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 256) {
    throw badRequest("Invalid checksum");
  }

  return trimmed;
}

function safeFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).filter(Boolean).at(-1) ?? "attachment";
  const sanitized = baseName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);

  return sanitized || "attachment";
}

function defaultStorageKey(fileName: string): string {
  return `tmp/uploads/${randomUUID()}/${safeFileName(fileName)}`;
}

function expiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + uploadIntentExpiresInSeconds * 1_000);
}

function toUploadIntentDTO(intent: UploadIntentRecord): UploadIntentDTO {
  return {
    id: intent.id,
    documentId: intent.documentId,
    uploaderUserId: intent.uploaderUserId,
    blockType: intent.blockType,
    fileName: intent.fileName,
    mimeType: intent.mimeType,
    sizeBytes: intent.sizeBytes,
    checksum: intent.checksum,
    status: intent.status,
    failureReason: intent.failureReason,
    failureDetail: intent.failureDetail,
    expiresAt: toIsoString(intent.expiresAt),
    confirmedAt: intent.confirmedAt ? toIsoString(intent.confirmedAt) : null,
    cleanedAt: intent.cleanedAt ? toIsoString(intent.cleanedAt) : null,
    createdAt: toIsoString(intent.createdAt),
    updatedAt: toIsoString(intent.updatedAt)
  };
}

function toAttachmentDTO(attachment: AttachmentRecord): AttachmentMetadataDTO {
  return {
    id: attachment.id,
    documentId: attachment.documentId,
    uploadedByUserId: attachment.uploadedByUserId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksum: attachment.checksum,
    etag: attachment.etag,
    createdAt: toIsoString(attachment.createdAt)
  };
}

function toDirectUploadTarget(upload: {
  readonly url: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}): DirectUploadTarget {
  return {
    method: "PUT",
    url: upload.url,
    requiredHeaders: upload.requiredHeaders,
    expiresAt: toIsoString(upload.expiresAt)
  };
}

function toUploadIntentRecord(record: {
  readonly id: string;
  readonly documentId: string;
  readonly uploaderUserId: string;
  readonly blockType: AttachmentBlockType;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly status: UploadIntentStatus;
  readonly failureReason: UploadFailureReason | null;
  readonly failureDetail: string | null;
  readonly expiresAt: Date;
  readonly confirmedAt: Date | null;
  readonly cleanedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): UploadIntentRecord {
  return record;
}

function toAttachmentRecord(record: {
  readonly id: string;
  readonly documentId: string;
  readonly uploadIntentId: string | null;
  readonly uploadedByUserId: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly etag: string | null;
  readonly createdAt: Date;
}): AttachmentRecord {
  return record;
}

const uploadIntentSelect = {
  id: true,
  documentId: true,
  uploaderUserId: true,
  blockType: true,
  storageKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  status: true,
  failureReason: true,
  failureDetail: true,
  expiresAt: true,
  confirmedAt: true,
  cleanedAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UploadIntentSelect;

const attachmentSelect = {
  id: true,
  documentId: true,
  uploadIntentId: true,
  uploadedByUserId: true,
  storageKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  checksum: true,
  etag: true,
  createdAt: true
} satisfies Prisma.DocumentAttachmentSelect;

export class PrismaAttachmentRepository implements AttachmentRepository {
  readonly auditEvents: readonly unknown[] = [];

  constructor(private readonly prisma: PrismaClient) {}

  async createUploadIntent(input: {
    readonly documentId: string;
    readonly uploaderUserId: string;
    readonly blockType: AttachmentBlockType;
    readonly storageKey: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly checksum: string | null;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }): Promise<UploadIntentRecord> {
    const intent = await this.prisma.uploadIntent.create({
      data: {
        documentId: input.documentId,
        uploaderUserId: input.uploaderUserId,
        blockType: input.blockType,
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        checksum: input.checksum,
        status: "pending",
        expiresAt: input.expiresAt,
        createdAt: input.createdAt
      },
      select: uploadIntentSelect
    });

    return toUploadIntentRecord(intent as UploadIntentRecord);
  }

  async findUploadIntentById(uploadIntentId: string): Promise<UploadIntentRecord | null> {
    const intent = await this.prisma.uploadIntent.findUnique({
      where: { id: uploadIntentId },
      select: uploadIntentSelect
    });

    return intent ? toUploadIntentRecord(intent as UploadIntentRecord) : null;
  }

  async confirmUploadIntent(input: {
    readonly uploadIntentId: string;
    readonly uploaderUserId: string;
    readonly now: Date;
    readonly etag: string | null;
  }): Promise<ConfirmUploadIntentRepositoryResult> {
    return this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.uploadIntent.updateMany({
        where: {
          id: input.uploadIntentId,
          uploaderUserId: input.uploaderUserId,
          status: "pending",
          expiresAt: { gt: input.now }
        },
        data: {
          status: "confirmed",
          confirmedAt: input.now,
          failureReason: null,
          failureDetail: null
        }
      });

      if (claimed.count !== 1) {
        return { outcome: "unavailable" };
      }

      const intent = await transaction.uploadIntent.findUniqueOrThrow({
        where: { id: input.uploadIntentId },
        select: uploadIntentSelect
      });
      const attachment = await transaction.documentAttachment.create({
        data: {
          documentId: intent.documentId,
          uploadIntentId: intent.id,
          uploadedByUserId: intent.uploaderUserId,
          storageKey: intent.storageKey,
          fileName: intent.fileName,
          mimeType: intent.mimeType,
          sizeBytes: intent.sizeBytes,
          checksum: intent.checksum,
          etag: input.etag
        },
        select: attachmentSelect
      });

      return {
        outcome: "confirmed",
        intent: toUploadIntentRecord(intent as UploadIntentRecord),
        attachment: toAttachmentRecord(attachment)
      };
    });
  }

  async markUploadIntentFailed(input: {
    readonly uploadIntentId: string;
    readonly uploaderUserId: string;
    readonly failureReason: UploadFailureReason;
    readonly failureDetail: string;
  }): Promise<UploadIntentRecord | null> {
    const claimed = await this.prisma.uploadIntent.updateMany({
      where: {
        id: input.uploadIntentId,
        uploaderUserId: input.uploaderUserId,
        status: "pending"
      },
      data: {
        status: "failed",
        failureReason: input.failureReason,
        failureDetail: trimFailureDetail(input.failureDetail)
      }
    });

    if (claimed.count !== 1) {
      return null;
    }

    const intent = await this.findUploadIntentById(input.uploadIntentId);
    return intent;
  }

  async findAttachmentById(attachmentId: string): Promise<AttachmentRecord | null> {
    const attachment = await this.prisma.documentAttachment.findUnique({
      where: { id: attachmentId },
      select: attachmentSelect
    });

    return attachment ? toAttachmentRecord(attachment) : null;
  }
}

export function createAttachmentService(
  repository: AttachmentRepository,
  permissions: Pick<PermissionService, "canEditDocument" | "canDownloadAttachment">,
  storage: ObjectStorage,
  options: AttachmentServiceOptions = {}
) {
  const now = options.now ?? (() => new Date());
  const createStorageKey = options.createStorageKey ?? defaultStorageKey;

  async function failIntent(
    intent: UploadIntentRecord,
    failureReason: UploadFailureReason,
    failureDetail: string
  ): Promise<void> {
    await repository.markUploadIntentFailed({
      uploadIntentId: intent.id,
      uploaderUserId: intent.uploaderUserId,
      failureReason,
      failureDetail: trimFailureDetail(failureDetail)
    });
  }

  async function loadPendingOwnedIntent(input: {
    readonly actor: AttachmentActor;
    readonly uploadIntentId: string;
    readonly now: Date;
  }): Promise<UploadIntentRecord> {
    const intent = await repository.findUploadIntentById(input.uploadIntentId);

    if (!intent || intent.uploaderUserId !== input.actor.userId) {
      throw notFound();
    }

    if (intent.status !== "pending") {
      throw conflict("Upload intent is not pending");
    }

    if (intent.expiresAt <= input.now) {
      await failIntent(intent, "expired", "Upload intent expired");
      throw conflict("Upload intent expired");
    }

    return intent;
  }

  function ensureObjectMatchesIntent(intent: UploadIntentRecord, metadata: ObjectMetadata): void {
    if (metadata.sizeBytes !== intent.sizeBytes) {
      throw conflict("Uploaded object size mismatch");
    }

    if (normalizeMimeType(metadata.mimeType) !== normalizeMimeType(intent.mimeType)) {
      throw conflict("Uploaded object MIME type mismatch");
    }
  }

  return {
    async createUploadIntent(input: {
      readonly actor: AttachmentActor;
      readonly documentId: string;
      readonly blockType: AttachmentBlockType;
      readonly fileName: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
      readonly checksum?: string;
    }): Promise<CreateUploadIntentResponse> {
      ensureBlockType(input.blockType);
      const fileName = ensureFileName(input.fileName);
      const mimeType = ensureMimeType(input.mimeType);
      ensureSizeBytes(input.blockType, input.sizeBytes);

      if (!(await permissions.canEditDocument(input.actor.userId, input.documentId))) {
        throw forbidden();
      }

      const createdAt = now();
      const intent = await repository.createUploadIntent({
        documentId: input.documentId,
        uploaderUserId: input.actor.userId,
        blockType: input.blockType,
        storageKey: createStorageKey(fileName),
        fileName,
        mimeType,
        sizeBytes: input.sizeBytes,
        checksum: normalizeChecksum(input.checksum),
        createdAt,
        expiresAt: expiresAt(createdAt)
      });
      const upload = await storage.createPresignedPutUrl({
        storageKey: intent.storageKey,
        mimeType: intent.mimeType,
        expiresInSeconds: uploadIntentExpiresInSeconds,
        now: createdAt
      });

      return {
        intent: toUploadIntentDTO(intent),
        upload: toDirectUploadTarget(upload)
      };
    },

    async confirmUploadIntent(input: {
      readonly actor: AttachmentActor;
      readonly uploadIntentId: string;
    }): Promise<ConfirmUploadIntentResponse> {
      const checkedAt = now();
      const intent = await loadPendingOwnedIntent({
        actor: input.actor,
        uploadIntentId: input.uploadIntentId,
        now: checkedAt
      });

      if (!(await permissions.canEditDocument(input.actor.userId, intent.documentId))) {
        await failIntent(intent, "permission_revoked", "Document edit permission revoked");
        throw forbidden();
      }

      let metadata: ObjectMetadata | null;
      try {
        metadata = await storage.headObject(intent.storageKey);
      } catch (error) {
        if (error instanceof ObjectStorageError) {
          await failIntent(intent, "storage_error", "Object storage HEAD failed");
          throw unavailable();
        }

        throw error;
      }

      if (!metadata) {
        await failIntent(intent, "object_missing", "Uploaded object missing");
        throw conflict("Uploaded object missing");
      }

      try {
        ensureObjectMatchesIntent(intent, metadata);
      } catch (error) {
        if (error instanceof AttachmentError) {
          await failIntent(
            intent,
            error.message.includes("size") ? "size_mismatch" : "mime_mismatch",
            error.message
          );
        }

        throw error;
      }

      if (!(await permissions.canEditDocument(input.actor.userId, intent.documentId))) {
        await failIntent(intent, "permission_revoked", "Document edit permission revoked");
        throw forbidden();
      }

      const confirmedAt = now();

      if (intent.expiresAt <= confirmedAt) {
        await failIntent(intent, "expired", "Upload intent expired");
        throw conflict("Upload intent expired");
      }

      const result = await repository.confirmUploadIntent({
        uploadIntentId: intent.id,
        uploaderUserId: input.actor.userId,
        now: confirmedAt,
        etag: metadata.etag
      });

      if (result.outcome !== "confirmed") {
        throw conflict("Upload intent is no longer pending");
      }

      return {
        intent: toUploadIntentDTO(result.intent),
        attachment: toAttachmentDTO(result.attachment)
      };
    },

    async createAttachmentDownload(input: {
      readonly actor: AttachmentActor;
      readonly attachmentId: string;
    }): Promise<AttachmentDownloadResponse> {
      if (!(await permissions.canDownloadAttachment(input.actor.userId, input.attachmentId))) {
        throw notFound();
      }

      const attachment = await repository.findAttachmentById(input.attachmentId);

      if (!attachment) {
        throw notFound();
      }

      const issuedAt = now();
      const signedUrl = await storage.createPresignedGetUrl({
        storageKey: attachment.storageKey,
        expiresInSeconds: attachmentDownloadUrlExpiresInSeconds,
        now: issuedAt
      });

      return {
        attachment: toAttachmentDTO(attachment),
        downloadUrl: signedUrl.url,
        expiresAt: toIsoString(signedUrl.expiresAt)
      };
    }
  };
}

export type AttachmentService = ReturnType<typeof createAttachmentService>;

let cachedService: AttachmentService | undefined;

export async function getDefaultAttachmentService(): Promise<AttachmentService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createAttachmentService(
      new PrismaAttachmentRepository(prisma),
      {
        canEditDocument: defaultCanEditDocument,
        canDownloadAttachment: defaultCanDownloadAttachment
      },
      getDefaultObjectStorage()
    );
  }

  return cachedService;
}
