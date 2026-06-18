import type { AttachmentBlockType, EditorBlock } from "@jixia/shared";
import { useState } from "react";

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
  readonly readOnly: boolean;
};

type AttachmentBlockMetadata = {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string | null;
  readonly uploadedAt: string;
};

export function AttachmentBlock({ documentId, block, index, onChange, readOnly }: AttachmentBlockProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "opening" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const metadata = readAttachmentMetadata(block.attrs?.attachment);
  const hasAttachment = Boolean(block.attachmentId);
  const blockLabel = block.type === "image" ? "image" : "file";

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const selectedFile = input.files?.item(0);

    if (!selectedFile) {
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
      setStatus("idle");
      setMessage("Attachment uploaded and linked to this block.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to upload attachment.");
    } finally {
      input.value = "";
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

  return (
    <section
      aria-label={`Block ${index + 1} ${blockLabel} attachment`}
      className="jixia-attachment-inline"
    >
      <div className="jixia-attachment-inline__header">
        <div className="jixia-attachment-inline__title">
          <span aria-hidden="true">{block.type === "image" ? "▧" : "⇲"}</span>
          <div>
            <p className="jixia-eyebrow">{blockLabel} attachment</p>
            <strong>{hasAttachment ? "Private attachment linked" : "No attachment linked"}</strong>
          </div>
        </div>
        <Pill tone={hasAttachment ? "success" : "warning"}>{hasAttachment ? "linked" : "placeholder"}</Pill>
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
        <p className="jixia-description" style={{ margin: 0 }}>
          Select a {blockLabel} to request a server upload intent, upload to the transient signed URL, and link the
          confirmed attachment ID to this block.
        </p>
      )}

      <div className="jixia-attachment-inline__actions">
        <label style={uploadControlStyle}>
          <span>{hasAttachment ? `Replace ${blockLabel}` : `Upload ${blockLabel}`}</span>
          <input
            accept={block.type === "image" ? "image/*" : undefined}
            aria-label={`Block ${index + 1} ${blockLabel} upload`}
            disabled={readOnly || status === "uploading"}
            onChange={handleUpload}
            style={fileInputStyle}
            type="file"
          />
        </label>
        <Button
          disabled={!hasAttachment || status === "opening"}
          onClick={handleOpenAttachment}
        >
          {status === "opening" ? "Opening…" : "Open attachment"}
        </Button>
      </div>

      {status === "uploading" ? <p className="jixia-description">Uploading through server-issued intent…</p> : null}
      {message ? (
        <Notice role={status === "error" ? "alert" : "status"} tone={status === "error" ? "danger" : "info"}>
          {message}
        </Notice>
      ) : null}
    </section>
  );
}

function withUploadedAttachment(
  block: AttachmentEditorBlock,
  uploadedAttachment: UploadedAttachmentResult
): EditorBlock {
  return {
    ...block,
    attachmentId: uploadedAttachment.attachmentId,
    attrs: {
      ...block.attrs,
      attachment: {
        fileName: uploadedAttachment.fileName,
        mimeType: uploadedAttachment.mimeType,
        sizeBytes: uploadedAttachment.sizeBytes,
        checksum: uploadedAttachment.checksum,
        uploadedAt: uploadedAttachment.createdAt
      } satisfies AttachmentBlockMetadata
    }
  };
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

const uploadControlStyle = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "8px",
  color: "#334e68",
  fontSize: "12px",
  fontWeight: 800
} as const;

const fileInputStyle = {
  color: "#475569",
  font: "inherit",
  fontSize: "12px"
};
