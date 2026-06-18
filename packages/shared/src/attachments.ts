import type { EditorBlockType } from "./documents";

export const attachmentBlockTypes = ["image", "file"] as const;
export type AttachmentBlockType = Extract<EditorBlockType, (typeof attachmentBlockTypes)[number]>;

export const uploadIntentStatuses = ["pending", "confirmed", "failed", "expired", "cleaned"] as const;
export type UploadIntentStatus = (typeof uploadIntentStatuses)[number];

export const terminalUploadIntentStatuses = ["confirmed", "failed", "expired", "cleaned"] as const;
export type TerminalUploadIntentStatus = (typeof terminalUploadIntentStatuses)[number];

export const uploadFailureReasons = [
  "expired",
  "object_missing",
  "size_mismatch",
  "mime_mismatch",
  "storage_error",
  "permission_revoked"
] as const;
export type UploadFailureReason = (typeof uploadFailureReasons)[number];

export const uploadIntentExpiresInSeconds = 60 * 60;
export const attachmentDownloadUrlExpiresInSeconds = 15 * 60;
export const terminalUploadIntentMetadataRetentionDays = 30;
export const maxUploadFailureDetailLength = 512;

export const attachmentUploadLimitsByBlockType = {
  image: {
    maxSizeBytes: 100 * 1024 * 1024
  },
  file: {
    maxSizeBytes: 200 * 1024 * 1024
  }
} as const satisfies Record<AttachmentBlockType, { readonly maxSizeBytes: number }>;

export type AttachmentMetadataDTO = {
  readonly id: string;
  readonly documentId: string;
  readonly uploadedByUserId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly etag: string | null;
  readonly createdAt: string;
};

export type UploadIntentDTO = {
  readonly id: string;
  readonly documentId: string;
  readonly uploaderUserId: string;
  readonly blockType: AttachmentBlockType;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly status: UploadIntentStatus;
  readonly failureReason: UploadFailureReason | null;
  readonly failureDetail: string | null;
  readonly expiresAt: string;
  readonly confirmedAt: string | null;
  readonly cleanedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CreateUploadIntentRequest = {
  readonly documentId: string;
  readonly blockType: AttachmentBlockType;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum?: string;
};

export type DirectUploadTarget = {
  readonly method: "PUT";
  readonly url: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly expiresAt: string;
};

export type CreateUploadIntentResponse = {
  readonly intent: UploadIntentDTO;
  readonly upload: DirectUploadTarget;
};

export type ConfirmUploadIntentRequest = {
  readonly uploadIntentId: string;
};

export type ConfirmUploadIntentResponse = {
  readonly intent: UploadIntentDTO;
  readonly attachment: AttachmentMetadataDTO;
};

export type AttachmentDownloadRequest = {
  readonly attachmentId: string;
};

export type AttachmentDownloadResponse = {
  readonly attachment: AttachmentMetadataDTO;
  readonly downloadUrl: string;
  readonly expiresAt: string;
};

export type UploadIntentFailureView = {
  readonly intent: UploadIntentDTO;
  readonly visibleToUserId: string;
};

export function getAttachmentUploadLimit(blockType: AttachmentBlockType): number {
  return attachmentUploadLimitsByBlockType[blockType].maxSizeBytes;
}

export function isTerminalUploadIntentStatus(
  status: UploadIntentStatus
): status is TerminalUploadIntentStatus {
  return (terminalUploadIntentStatuses as readonly UploadIntentStatus[]).includes(status);
}
