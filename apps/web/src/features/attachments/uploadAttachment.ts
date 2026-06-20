import type {
  AttachmentBlockType,
  AttachmentDownloadRequest,
  AttachmentDownloadResponse,
  AttachmentMetadataDTO,
  ConfirmUploadIntentRequest,
  ConfirmUploadIntentResponse,
  CreateUploadIntentRequest,
  CreateUploadIntentResponse
} from "@jixia/shared";
import { attachmentBlockTypes } from "@jixia/shared";

import { apiFetch } from "../../lib/api";

export type UploadAttachmentInput = {
  readonly documentId: string;
  readonly blockType: AttachmentBlockType;
  readonly file: Blob;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly checksum?: string;
};

export type UploadedAttachmentResult = {
  readonly attachmentId: string;
  readonly documentId: string;
  readonly blockType: AttachmentBlockType;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly etag: string | null;
  readonly createdAt: string;
};

export type OpenAttachmentDownloadInput = {
  readonly attachmentId: string;
  readonly opener?: (url: string) => void;
};

const attachmentBlockTypeSet = new Set<AttachmentBlockType>(attachmentBlockTypes);

const forbiddenStorageResponseKeys = new Set([
  "accesskeyid",
  "accesskey",
  "authorization",
  "awsaccesskeyid",
  "awssecretaccesskey",
  "bucket",
  "credentials",
  "filekey",
  "objectstoragecredentials",
  "objectkey",
  "secretaccesskey",
  "secretkey",
  "sessiontoken",
  "storagecredentials",
  "storagekey",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature"
]);

const forbiddenUploadHeaderNames = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature"
]);

export async function uploadAttachment(input: UploadAttachmentInput): Promise<UploadedAttachmentResult> {
  ensureAttachmentBlockType(input.blockType);
  const intentRequest = createUploadIntentRequest(input);
  const intentResponse = await requestUploadIntent(intentRequest);
  assertNoForbiddenStorageKeys(intentResponse);
  ensureDirectUploadTarget(intentResponse);

  await uploadBlobToSignedUrl({
    file: input.file,
    mimeType: intentRequest.mimeType,
    upload: intentResponse.upload
  });

  const confirmResponse = await confirmUploadIntent(intentResponse.intent.id);
  assertNoForbiddenStorageKeys(confirmResponse);

  return safeUploadResult(input.blockType, confirmResponse.attachment);
}

export async function openAttachmentDownload({
  attachmentId,
  opener = openInNewBrowserContext
}: OpenAttachmentDownloadInput): Promise<AttachmentMetadataDTO> {
  const payload: AttachmentDownloadRequest = { attachmentId };
  const response = await requestDownloadUrl(payload);
  assertNoForbiddenStorageKeys(response);
  opener(response.downloadUrl);
  return response.attachment;
}

function createUploadIntentRequest(input: UploadAttachmentInput): CreateUploadIntentRequest {
  return {
    documentId: input.documentId,
    blockType: input.blockType,
    fileName: attachmentFileName(input),
    mimeType: attachmentMimeType(input),
    sizeBytes: input.file.size,
    ...(input.checksum === undefined ? {} : { checksum: input.checksum })
  };
}

async function requestUploadIntent(payload: CreateUploadIntentRequest): Promise<CreateUploadIntentResponse> {
  try {
    return await apiFetch<CreateUploadIntentResponse>("/attachments/upload-intents", {
      method: "POST",
      json: payload
    });
  } catch (error) {
    throw safeAttachmentError("Attachment upload intent request failed", error);
  }
}

async function uploadBlobToSignedUrl(input: {
  readonly file: Blob;
  readonly mimeType: string;
  readonly upload: CreateUploadIntentResponse["upload"];
}): Promise<void> {
  const headers = directUploadHeaders(input.upload.requiredHeaders, input.mimeType);

  let response: Response;
  try {
    response = await fetch(input.upload.url, {
      method: "PUT",
      body: input.file,
      headers,
      credentials: "omit"
    });
  } catch {
    throw new Error(directUploadFailureMessage(input.upload, headers));
  }

  if (!response.ok) {
    throw new Error(directUploadFailureMessage(input.upload, headers, response));
  }
}

function directUploadFailureMessage(
  upload: CreateUploadIntentResponse["upload"],
  requestHeaders: Headers,
  response?: Response
): string {
  const target = directUploadTargetSummary(upload.url);
  const pageOrigin = typeof window === "undefined" ? "unknown" : window.location.origin;
  const headerNames = Array.from(requestHeaders.keys()).sort().join(", ") || "none";
  const responseHeaders = response ? Array.from(response.headers.keys()).sort().join(", ") || "none" : "none";
  const status = response ? `status ${response.status}` : "no HTTP response";

  return [
    `Attachment direct upload failed before confirmation (${status}).`,
    `Target: ${target}; page origin: ${pageOrigin}; request headers: ${headerNames}; response headers: ${responseHeaders}.`,
    "Check local object-storage service reachability, public base URL, and CORS/preflight configuration."
  ].join(" ");
}

function directUploadTargetSummary(url: string): string {
  try {
    const parsedUrl = new URL(url, typeof window === "undefined" ? "http://localhost" : window.location.href);
    const endpoint = parsedUrl.pathname.includes("/local-object-storage/upload/")
      ? "local object-storage upload endpoint"
      : "signed upload endpoint";
    return `${endpoint} at ${parsedUrl.origin}`;
  } catch {
    return "invalid signed upload endpoint";
  }
}

async function confirmUploadIntent(uploadIntentId: string): Promise<ConfirmUploadIntentResponse> {
  const payload: ConfirmUploadIntentRequest = { uploadIntentId };

  try {
    return await apiFetch<ConfirmUploadIntentResponse>(
      `/attachments/upload-intents/${encodeURIComponent(uploadIntentId)}/confirm`,
      {
        method: "POST",
        json: payload
      }
    );
  } catch (error) {
    throw safeAttachmentError("Attachment upload confirmation failed", error);
  }
}

async function requestDownloadUrl(payload: AttachmentDownloadRequest): Promise<AttachmentDownloadResponse> {
  try {
    return await apiFetch<AttachmentDownloadResponse>(
      `/attachments/${encodeURIComponent(payload.attachmentId)}/download`,
      {
        method: "POST",
        json: payload
      }
    );
  } catch (error) {
    throw safeAttachmentError("Attachment download URL request failed", error);
  }
}

function ensureAttachmentBlockType(blockType: AttachmentBlockType): void {
  if (!attachmentBlockTypeSet.has(blockType)) {
    throw new Error("Unsupported attachment block type.");
  }
}

function attachmentFileName(input: UploadAttachmentInput): string {
  const providedFileName = input.fileName?.trim();

  if (providedFileName) {
    return providedFileName;
  }

  if (isNamedBlob(input.file) && input.file.name.trim()) {
    return input.file.name.trim();
  }

  return "attachment";
}

function attachmentMimeType(input: UploadAttachmentInput): string {
  const providedMimeType = input.mimeType?.trim().toLowerCase();

  if (providedMimeType) {
    return providedMimeType;
  }

  const fileMimeType = input.file.type.trim().toLowerCase();
  return fileMimeType || "application/octet-stream";
}

function isNamedBlob(value: Blob): value is Blob & { readonly name: string } {
  return "name" in value && typeof value.name === "string";
}

function ensureDirectUploadTarget(response: CreateUploadIntentResponse): void {
  if (response.upload.method !== "PUT") {
    throw new Error("Attachment upload target used an unsupported method.");
  }

  if (!response.upload.url || typeof response.upload.url !== "string") {
    throw new Error("Attachment upload target was missing.");
  }
}

function directUploadHeaders(requiredHeaders: Readonly<Record<string, string>>, mimeType: string): Headers {
  const headers = new Headers();

  for (const [headerName, headerValue] of Object.entries(requiredHeaders)) {
    const normalizedHeaderName = headerName.trim().toLowerCase();
    if (forbiddenUploadHeaderNames.has(normalizedHeaderName)) {
      throw new Error("Attachment upload target included unsupported credential headers.");
    }
    headers.set(headerName, headerValue);
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", mimeType);
  }

  return headers;
}

function safeUploadResult(
  blockType: AttachmentBlockType,
  attachment: AttachmentMetadataDTO
): UploadedAttachmentResult {
  return {
    attachmentId: attachment.id,
    documentId: attachment.documentId,
    blockType,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksum: attachment.checksum,
    etag: attachment.etag,
    createdAt: attachment.createdAt
  };
}

function safeAttachmentError(prefix: string, error: unknown): Error {
  const message = error instanceof Error && error.message ? error.message : "Unexpected attachment error.";
  return new Error(`${prefix}: ${redactAttachmentSecretText(message)}`);
}

function redactAttachmentSecretText(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted attachment url]")
    .replace(/\b(?:authorization|bearer|credential|credentials|secret|signature|token|storageKey|objectKey)\b\S*/gi, "[redacted]");
}

function assertNoForbiddenStorageKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoForbiddenStorageKeys(item);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenStorageResponseKeys.has(key.trim().toLowerCase())) {
      throw new Error("Attachment API response included unsupported storage fields.");
    }
    assertNoForbiddenStorageKeys(child);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function openInNewBrowserContext(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
