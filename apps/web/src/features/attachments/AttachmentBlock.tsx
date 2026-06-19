import type { AttachmentBlockType, EditorBlock } from "@jixia/shared";
import { type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent, type ClipboardEvent, useEffect, useRef, useState } from "react";

import { Button, Notice, Pill } from "../layout/workbench";
import { openAttachmentDownload, uploadAttachment, type UploadedAttachmentResult } from "./uploadAttachment";

type AttachmentEditorBlock = EditorBlock & {
  readonly type: AttachmentBlockType;
};

type AttachmentBlockProps = {
  readonly documentId: string;
  readonly block: AttachmentEditorBlock;
  readonly index: number;
  readonly onChange: (nextBlock: EditorBlock) => void;
  readonly onRemove: () => void;
  readonly readOnly: boolean;
  readonly runtimeUpload?: RuntimeUploadState | undefined;
};

type RuntimeUploadState = {
  readonly status?: "uploading" | "success" | "error" | undefined;
  readonly message?: string | undefined;
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly sizeBytes?: number | undefined;
};

type AttachmentBlockMetadata = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly uploadedAt: string;
};

type AttachmentDisplayMetadata = {
  readonly caption?: string | undefined;
  readonly altText?: string | undefined;
  readonly description?: string | undefined;
  readonly previewWidth?: number | undefined;
  readonly showPreview?: boolean | undefined;
};

export function AttachmentBlock({ documentId, block, index, onChange, onRemove, readOnly, runtimeUpload }: AttachmentBlockProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "opening" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragState, setDragState] = useState<"idle" | "ready">("idle");
  const metadata = readAttachmentMetadata(block.attrs?.attachment);
  const displayMetadata = readAttachmentDisplayMetadata(block.attrs);
  const hasAttachment = Boolean(block.attachmentId);
  const blockLabel = block.type === "image" ? "image" : "file";
  const showPreview = displayMetadata.showPreview ?? block.type === "image";
  const previewWidth = displayMetadata.previewWidth ?? 420;
  const effectiveStatus = status === "idle" && runtimeUpload?.status ? runtimeUpload.status : status;
  const effectiveMessage = message ?? runtimeUpload?.message ?? null;
  const pendingName = runtimeUpload?.fileName;
  const pendingMimeType = runtimeUpload?.mimeType;
  const pendingSizeBytes = runtimeUpload?.sizeBytes;
  const cardAction = readOnly
    ? hasAttachment ? "Open or download this attachment" : "No attachment linked"
    : hasAttachment ? `Open or replace this ${blockLabel}` : `Upload ${blockLabel}`;

  useEffect(() => {
    setPreviewUrl(null);
  }, [block.attachmentId]);

  async function handleInputUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const selectedFile = input.files?.item?.(0) ?? input.files?.[0];

    if (!selectedFile) {
      return;
    }

    await uploadSelectedFile(selectedFile);
    input.value = "";
  }

  async function uploadSelectedFile(selectedFile: File): Promise<void> {
    if (readOnly) {
      return;
    }

    if (!acceptsFile(block.type, selectedFile)) {
      setStatus("error");
      setMessage(block.type === "image" ? "Image blocks only accept image files." : "Unsupported attachment file.");
      return;
    }

    setStatus("uploading");
    setMessage(null);

    try {
      const uploadedAttachment = await uploadAttachment({
        documentId,
        blockType: block.type,
        file: selectedFile
      });
      onChange(withUploadedAttachment(block, uploadedAttachment));
      setStatus("success");
      setMessage("Attachment uploaded and linked to this block.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to upload attachment.");
    }
  }

  async function handleLoadPreview(): Promise<void> {
    if (!block.attachmentId) {
      return;
    }

    setStatus("opening");
    setMessage(null);

    try {
      await openAttachmentDownload({ attachmentId: block.attachmentId, opener: setPreviewUrl });
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to load attachment preview.");
    }
  }

  async function handleOpenAttachment(): Promise<void> {
    if (!block.attachmentId) {
      return;
    }

    setStatus("opening");
    setMessage(null);

    try {
      await openAttachmentDownload({ attachmentId: block.attachmentId });
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to open attachment.");
    }
  }

  function updateDisplayMetadata(nextMetadata: Partial<AttachmentDisplayMetadata>): void {
    onChange(withDisplayMetadata(block, nextMetadata));
  }

  function handleCardClick(event: MouseEvent<HTMLElement>): void {
    if (isInteractiveElement(event.target)) {
      return;
    }

    activateCard();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (isInteractiveElement(event.target)) {
      return;
    }

    event.preventDefault();
    activateCard();
  }

  function activateCard(): void {
    if (readOnly) {
      if (hasAttachment) {
        void handleOpenAttachment();
      }
      return;
    }

    if (hasAttachment) {
      void handleOpenAttachment();
      return;
    }

    openFilePicker();
  }

  function openFilePicker(): void {
    if (!readOnly && effectiveStatus !== "uploading") {
      fileInputRef.current?.click();
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>): void {
    if (readOnly || !dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDragState("ready");
  }

  function handleDragLeave(event: DragEvent<HTMLElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragState("idle");
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>): void {
    if (readOnly) {
      return;
    }

    const selectedFile = filesFromDataTransfer(event.dataTransfer).find((file) => acceptsFile(block.type, file));
    if (!selectedFile) {
      setDragState("idle");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragState("idle");
    void uploadSelectedFile(selectedFile);
  }

  function handlePaste(event: ClipboardEvent<HTMLElement>): void {
    if (readOnly) {
      return;
    }

    const selectedFile = filesFromClipboardData(event.clipboardData).find((file) => acceptsFile(block.type, file));
    if (!selectedFile) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void uploadSelectedFile(selectedFile);
  }

  function clearAttachment(): void {
    if (!readOnly) {
      setPreviewUrl(null);
      setStatus("idle");
      setMessage(null);
      onChange(withoutUploadedAttachment(block));
    }
  }

  return (
    <section
      aria-label={`Block ${index + 1} ${blockLabel} attachment`}
      className="jixia-attachment-inline"
      data-drag-state={dragState}
      data-status={effectiveStatus}
      onClick={handleCardClick}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleCardKeyDown}
      onPaste={handlePaste}
      role="group"
      tabIndex={0}
    >
      <div className="jixia-attachment-inline__header">
        <div className="jixia-attachment-inline__title">
          <span aria-hidden="true">{block.type === "image" ? "▧" : "⇲"}</span>
          <div>
            <p className="jixia-eyebrow">{blockLabel} attachment</p>
            <strong>{hasAttachment ? "Private attachment linked" : "No attachment linked"}</strong>
            <small>{cardAction}</small>
          </div>
        </div>
        <Pill tone={statusPillTone(effectiveStatus, hasAttachment)}>
          {statusLabel(effectiveStatus, hasAttachment)}
        </Pill>
      </div>

      {hasAttachment ? (
        <dl className="jixia-attachment-inline__metadata">
          <div>
            <dt>Name</dt>
            <dd>{metadata?.fileName ?? "Server metadata available on open"}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{metadata?.mimeType ?? "private"}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{metadata ? formatBytes(metadata.sizeBytes) : "private"}</dd>
          </div>
          <div>
            <dt>Attachment ID</dt>
            <dd>{block.attachmentId ?? ""}</dd>
          </div>
        </dl>
      ) : (
        <div className="jixia-attachment-inline__dropzone" aria-label={`Block ${index + 1} ${blockLabel} upload dropzone`}>
          <strong>{effectiveStatus === "uploading" ? "Upload in progress…" : "Click, paste, or drop here"}</strong>
          <p className="jixia-description" style={{ margin: 0 }}>
            Select a {blockLabel} to request a server upload intent, upload to the transient signed URL, and link the
            confirmed attachment ID to this block.
          </p>
          {pendingName ? (
            <dl className="jixia-attachment-inline__metadata" aria-label="Pending upload metadata">
              <div>
                <dt>Name</dt>
                <dd>{pendingName}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{pendingMimeType ?? "private"}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{typeof pendingSizeBytes === "number" ? formatBytes(pendingSizeBytes) : "private"}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      )}

      {block.type === "image" && hasAttachment && showPreview ? (
        <figure className="jixia-attachment-inline__preview">
          {previewUrl ? (
            <img
              alt={displayMetadata.altText || metadata?.fileName || "Private image preview"}
              src={previewUrl}
              style={{ maxWidth: `${previewWidth}px` }}
            />
          ) : (
            <Button disabled={status === "opening"} onClick={handleLoadPreview} variant="ghost">
              {status === "opening" ? "Loading preview…" : "Load private preview"}
            </Button>
          )}
          {displayMetadata.caption ? <figcaption>{displayMetadata.caption}</figcaption> : null}
        </figure>
      ) : null}

      {readOnly ? <ReadOnlyDisplayMetadata metadata={displayMetadata} type={block.type} /> : (
        <div className="jixia-attachment-inline__fields" aria-label={`Block ${index + 1} ${blockLabel} display metadata`}>
          <label className="jixia-field">
            <span>Caption</span>
            <input
              aria-label={`Block ${index + 1} ${blockLabel} caption`}
              onChange={(event) => updateDisplayMetadata({ caption: event.currentTarget.value })}
              placeholder="Optional caption"
              value={displayMetadata.caption ?? ""}
            />
          </label>
          <label className="jixia-field">
            <span>Description</span>
            <input
              aria-label={`Block ${index + 1} ${blockLabel} description`}
              onChange={(event) => updateDisplayMetadata({ description: event.currentTarget.value })}
              placeholder="Optional context for this attachment"
              value={displayMetadata.description ?? ""}
            />
          </label>
          {block.type === "image" ? (
            <label className="jixia-field">
              <span>Alt text</span>
              <input
                aria-label={`Block ${index + 1} image alt text`}
                onChange={(event) => updateDisplayMetadata({ altText: event.currentTarget.value })}
                placeholder="Describe the image for accessibility"
                value={displayMetadata.altText ?? ""}
              />
            </label>
          ) : null}
          <label className="jixia-attachment-inline__toggle">
            <input
              aria-label={`Block ${index + 1} ${blockLabel} show preview`}
              checked={showPreview}
              onChange={(event) => updateDisplayMetadata({ showPreview: event.currentTarget.checked })}
              type="checkbox"
            />
            <span>Show preview when available</span>
          </label>
          {block.type === "image" ? (
            <label className="jixia-field">
              <span>Preview width</span>
              <input
                aria-label={`Block ${index + 1} image preview width`}
                max={820}
                min={160}
                onChange={(event) => updateDisplayMetadata({ previewWidth: Number(event.currentTarget.value) })}
                step={20}
                type="range"
                value={previewWidth}
              />
              <span className="jixia-field__hint">{previewWidth}px</span>
            </label>
          ) : null}
        </div>
      )}

      <div className="jixia-attachment-inline__actions">
        {!readOnly ? (
          <label className="jixia-attachment-inline__upload-control">
            <span>{hasAttachment ? `Replace ${blockLabel}` : effectiveStatus === "error" ? `Retry ${blockLabel}` : `Upload ${blockLabel}`}</span>
            <input
              ref={fileInputRef}
              accept={block.type === "image" ? "image/*" : undefined}
              aria-label={`Block ${index + 1} ${blockLabel} upload`}
              disabled={effectiveStatus === "uploading"}
              onChange={handleInputUpload}
              style={fileInputStyle}
              type="file"
            />
          </label>
        ) : null}
        {!readOnly && effectiveStatus === "error" ? (
          <Button onClick={openFilePicker} variant="primary">
            Retry upload
          </Button>
        ) : null}
        <Button
          disabled={!hasAttachment || status === "opening"}
          onClick={handleOpenAttachment}
        >
          {status === "opening" ? "Opening…" : "Open attachment"}
        </Button>
        {!readOnly && hasAttachment ? (
          <Button onClick={clearAttachment} variant="danger">
            Clear attachment
          </Button>
        ) : null}
        {!readOnly ? (
          <Button onClick={onRemove} variant="danger">
            Remove block
          </Button>
        ) : null}
      </div>

      {effectiveStatus === "uploading" ? <p className="jixia-description">Uploading through server-issued intent…</p> : null}
      {effectiveMessage ? (
        <Notice role={effectiveStatus === "error" ? "alert" : "status"} tone={noticeTone(effectiveStatus)}>
          {effectiveMessage}
        </Notice>
      ) : null}
    </section>
  );
}

function ReadOnlyDisplayMetadata({ metadata, type }: {
  readonly metadata: AttachmentDisplayMetadata;
  readonly type: AttachmentBlockType;
}) {
  if (!metadata.caption && !metadata.description && !metadata.altText) {
    return null;
  }

  return (
    <dl className="jixia-attachment-inline__safe-metadata" aria-label={`${type} display metadata`}>
      {metadata.caption ? (
        <div>
          <dt>Caption</dt>
          <dd>{metadata.caption}</dd>
        </div>
      ) : null}
      {metadata.description ? (
        <div>
          <dt>Description</dt>
          <dd>{metadata.description}</dd>
        </div>
      ) : null}
      {type === "image" && metadata.altText ? (
        <div>
          <dt>Alt text</dt>
          <dd>{metadata.altText}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function withUploadedAttachment(
  block: AttachmentEditorBlock,
  uploadedAttachment: UploadedAttachmentResult
): EditorBlock {
  const displayMetadata = readAttachmentDisplayMetadata(block.attrs);

  return {
    ...block,
    attachmentId: uploadedAttachment.attachmentId,
    attrs: {
      attachment: {
        fileName: uploadedAttachment.fileName,
        mimeType: uploadedAttachment.mimeType,
        sizeBytes: uploadedAttachment.sizeBytes,
        checksum: uploadedAttachment.checksum,
        uploadedAt: uploadedAttachment.createdAt
      } satisfies AttachmentBlockMetadata,
      ...displayMetadata
    }
  };
}

function withDisplayMetadata(
  block: AttachmentEditorBlock,
  nextMetadata: Partial<AttachmentDisplayMetadata>
): EditorBlock {
  const currentMetadata = readAttachmentDisplayMetadata(block.attrs);
  const mergedMetadata = normalizeAttachmentDisplayMetadata({
    ...currentMetadata,
    ...nextMetadata
  });
  const attachmentMetadata = readAttachmentMetadata(block.attrs?.attachment);
  const attrs = compactAttrs({
    ...(attachmentMetadata ? { attachment: attachmentMetadata } : {}),
    ...mergedMetadata
  });
  const { attrs: _currentAttrs, ...blockWithoutAttrs } = block;

  return attrs ? { ...blockWithoutAttrs, attrs } : blockWithoutAttrs;
}

function withoutUploadedAttachment(block: AttachmentEditorBlock): EditorBlock {
  const displayMetadata = readAttachmentDisplayMetadata(block.attrs);
  const attrs = compactAttrs(displayMetadata as Record<string, unknown>);
  const { attachmentId: _attachmentId, attrs: _attrs, ...blockWithoutAttachment } = block;

  return attrs ? { ...blockWithoutAttachment, attrs } : blockWithoutAttachment;
}

function readAttachmentDisplayMetadata(value: unknown): AttachmentDisplayMetadata {
  if (!isRecord(value)) {
    return {};
  }

  return normalizeAttachmentDisplayMetadata({
    caption: readString(value.caption),
    altText: readString(value.altText),
    description: readString(value.description),
    previewWidth: readNumber(value.previewWidth),
    showPreview: typeof value.showPreview === "boolean" ? value.showPreview : undefined
  });
}

function normalizeAttachmentDisplayMetadata(value: AttachmentDisplayMetadata): AttachmentDisplayMetadata {
  return {
    ...(safeDisplayText(value.caption) ? { caption: safeDisplayText(value.caption) } : {}),
    ...(safeDisplayText(value.altText) ? { altText: safeDisplayText(value.altText) } : {}),
    ...(safeDisplayText(value.description) ? { description: safeDisplayText(value.description) } : {}),
    ...(safePreviewWidth(value.previewWidth) ? { previewWidth: safePreviewWidth(value.previewWidth) } : {}),
    ...(typeof value.showPreview === "boolean" ? { showPreview: value.showPreview } : {})
  };
}

function compactAttrs(value: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function readAttachmentMetadata(value: unknown): AttachmentBlockMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.fileName !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.sizeBytes !== "number" ||
    typeof value.uploadedAt !== "string"
  ) {
    return null;
  }

  return {
    fileName: value.fileName,
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
    checksum: typeof value.checksum === "string" ? value.checksum : null,
    uploadedAt: value.uploadedAt
  };
}

function safeDisplayText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 500) : undefined;
}

function safePreviewWidth(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(820, Math.max(160, Math.round(value)));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "private";
  }

  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusPillTone(status: "idle" | "uploading" | "opening" | "success" | "error", hasAttachment: boolean): "success" | "warning" | "danger" {
  if (status === "error") {
    return "danger";
  }

  if (status === "uploading" || status === "opening") {
    return "warning";
  }

  return hasAttachment ? "success" : "warning";
}

function statusLabel(status: "idle" | "uploading" | "opening" | "success" | "error", hasAttachment: boolean): string {
  if (status === "error") {
    return "error";
  }

  if (status === "uploading") {
    return "uploading";
  }

  if (status === "opening") {
    return "opening";
  }

  return hasAttachment ? "linked" : "placeholder";
}

function noticeTone(status: "idle" | "uploading" | "opening" | "success" | "error"): "info" | "success" | "danger" {
  if (status === "error") {
    return "danger";
  }

  if (status === "success") {
    return "success";
  }

  return "info";
}

function filesFromClipboardData(data: DataTransfer): readonly File[] {
  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  return itemFiles.length > 0 ? itemFiles : filesFromDataTransfer(data);
}

function filesFromDataTransfer(data: DataTransfer): readonly File[] {
  return Array.from(data.files ?? []).filter((file) => file.size > 0 || file.name.trim().length > 0);
}

function dataTransferHasFiles(data: DataTransfer): boolean {
  return Array.from(data.types ?? []).includes("Files") || data.files.length > 0;
}

function acceptsFile(type: AttachmentBlockType, file: File): boolean {
  return type === "file" || file.type.toLowerCase().startsWith("image/");
}

function isInteractiveElement(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest("button,input,select,textarea,label,a"));
}

const fileInputStyle = {
  color: "#475569",
  font: "inherit",
  fontSize: "12px"
};
