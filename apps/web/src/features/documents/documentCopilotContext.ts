import type {
  AIConversationContextSnapshot,
  DocumentDTO,
  EditorBlock,
  EditorSnapshot
} from "@jixia/shared";

export const documentCopilotContextMaxCharacters = 6_000;

export type DocumentCopilotContextSummary = {
  readonly documentId: string;
  readonly title: string;
  readonly documentType: DocumentDTO["type"];
  readonly projectId: string | null;
  readonly baseRevision: number;
  readonly currentRevision: number;
  readonly readOnly: boolean;
  readonly blockCount: number;
  readonly selectedBlockCount: number;
  readonly sourceCharacterCount: number;
  readonly boundedCharacterCount: number;
  readonly truncated: boolean;
  readonly capturedAt: string;
  readonly preview: string;
};

export type DocumentCopilotContext = {
  readonly snapshot: AIConversationContextSnapshot;
  readonly summary: DocumentCopilotContextSummary;
};

export type CreateDocumentCopilotContextInput = {
  readonly baseRevision: number;
  readonly capturedAt?: Date;
  readonly document: DocumentDTO;
  readonly maxCharacters?: number;
  readonly readOnly: boolean;
  readonly snapshot: EditorSnapshot;
  readonly title: string;
};

export type CreateEmptyDocumentCopilotContextSnapshotInput = {
  readonly capturedAt?: Date;
  readonly documentId: string;
};

export function createEmptyDocumentCopilotContextSnapshot({
  capturedAt = new Date(),
  documentId
}: CreateEmptyDocumentCopilotContextSnapshotInput): AIConversationContextSnapshot {
  return {
    currentDocumentId: documentId,
    capturedAt: capturedAt.toISOString(),
    items: []
  };
}

export function createDocumentCopilotContext({
  baseRevision,
  capturedAt = new Date(),
  document,
  maxCharacters = documentCopilotContextMaxCharacters,
  readOnly,
  snapshot,
  title
}: CreateDocumentCopilotContextInput): DocumentCopilotContext {
  const capturedAtIso = capturedAt.toISOString();
  const normalizedTitle = safeTitle(title, document.title);
  const extractedText = redactSensitiveContextText(extractPlainTextFromSnapshot(snapshot));
  const boundedText = boundText(extractedText, maxCharacters);
  const content = [
    `Document title: ${normalizedTitle}`,
    `Document id: ${document.id}`,
    `Document type: ${document.type}`,
    `Project id: ${document.projectId ?? "none"}`,
    `Base revision: ${baseRevision}`,
    `Current revision: ${document.revisionNumber}`,
    `Status: ${readOnly ? "read-only" : document.status}`,
    "Selected blocks: not implemented; current-document context only.",
    "",
    "Bounded document text:",
    boundedText.text || "[No readable text in the current editor snapshot.]"
  ].join("\n");
  const summary: DocumentCopilotContextSummary = {
    documentId: document.id,
    title: normalizedTitle,
    documentType: document.type,
    projectId: document.projectId,
    baseRevision,
    currentRevision: document.revisionNumber,
    readOnly,
    blockCount: countBlocks(snapshot.blocks),
    selectedBlockCount: 0,
    sourceCharacterCount: extractedText.length,
    boundedCharacterCount: boundedText.text.length,
    truncated: boundedText.truncated,
    capturedAt: capturedAtIso,
    preview: previewText(boundedText.text)
  };

  return {
    snapshot: {
      currentDocumentId: document.id,
      capturedAt: capturedAtIso,
      items: [
        {
          sourceType: "current_document",
          documentId: document.id,
          documentType: document.type,
          projectId: document.projectId,
          title: normalizedTitle,
          revisionNumber: baseRevision,
          selectedBlockIds: [],
          content,
          capturedAt: capturedAtIso
        }
      ]
    },
    summary
  };
}

export function extractPlainTextFromSnapshot(snapshot: EditorSnapshot): string {
  return snapshot.blocks
    .map((block) => blockToText(block, 0))
    .filter((line) => line.trim().length > 0)
    .join("\n\n")
    .trim();
}

export function redactSensitiveContextText(value: string): string {
  return value
    .replace(/\b(?:signedUrl|uploadUrl|downloadUrl|storageKey|objectKey|bucket|authorization|cookie|apiKey|encryptedApiKey|token)\b\s*[:=]\s*\S+/gi, "[redacted secret]")
    .replace(/https?:\/\/\S*(?:x-amz-signature|signature=|local-object-storage\/(?:upload|download)|storageKey|objectKey|bucket)\S*/gi, "[redacted storage URL]")
    .replace(/\b(?:Bearer)\s+\S+/gi, "[redacted authorization]");
}

function blockToText(block: EditorBlock, depth: number): string {
  const ownText = blockOwnText(block, depth);
  const childText = (block.content ?? [])
    .map((childBlock) => blockToText(childBlock, depth + 1))
    .filter((line) => line.trim().length > 0)
    .join("\n");

  return [ownText, childText].filter((line) => line.trim().length > 0).join("\n");
}

function blockOwnText(block: EditorBlock, depth: number): string {
  const text = safeInlineText(block.text ?? "");
  const indent = "  ".repeat(depth);

  switch (block.type) {
    case "heading":
      return text ? `${indent}${"#".repeat(safeHeadingLevel(block))} ${text}` : "";
    case "bulletList":
      return text ? `${indent}- ${text}` : "";
    case "orderedList":
      return text ? `${indent}1. ${text}` : "";
    case "todo":
      return text ? `${indent}${block.attrs?.checked === true ? "[x]" : "[ ]"} ${text}` : "";
    case "quote":
      return text ? `${indent}> ${text}` : "";
    case "callout":
      return text ? `${indent}Callout: ${text}` : "";
    case "codeBlock":
      return text ? `${indent}\`\`\`${safeInlineText(readStringAttr(block, "language") ?? "text")}\n${text}\n${indent}\`\`\`` : "";
    case "divider":
      return `${indent}---`;
    case "table":
      return text ? `${indent}${text}` : "";
    case "image":
      return `${indent}${attachmentText(block, "Image")}`;
    case "file":
      return `${indent}${attachmentText(block, "File")}`;
    case "paragraph":
    default:
      return text ? `${indent}${text}` : "";
  }
}

function attachmentText(block: EditorBlock, label: "File" | "Image"): string {
  const metadata = readAttachmentMetadata(block.attrs?.attachment);

  if (!metadata) {
    return `[${label} attachment: private attachment metadata omitted]`;
  }

  const parts = [metadata.fileName, metadata.mimeType, formatBytes(metadata.sizeBytes)].filter(Boolean);
  return `[${label} attachment: ${parts.join(" · ")}]`;
}

function readAttachmentMetadata(value: unknown): {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.fileName !== "string" ||
    typeof record.mimeType !== "string" ||
    typeof record.sizeBytes !== "number"
  ) {
    return null;
  }

  return {
    fileName: safeInlineText(record.fileName),
    mimeType: safeInlineText(record.mimeType),
    sizeBytes: record.sizeBytes
  };
}

function readStringAttr(block: EditorBlock, key: string): string | undefined {
  const value = block.attrs?.[key];
  return typeof value === "string" ? value : undefined;
}

function safeHeadingLevel(block: EditorBlock): number {
  const level = block.attrs?.level;
  return typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2;
}

function safeInlineText(value: string): string {
  return value.replace(/[\t ]+/g, " ").trim();
}

function safeTitle(title: string, fallbackTitle: string): string {
  const normalizedTitle = safeInlineText(title) || safeInlineText(fallbackTitle) || "Untitled document";
  return redactSensitiveContextText(normalizedTitle);
}

function countBlocks(blocks: readonly EditorBlock[]): number {
  return blocks.reduce((total, block) => total + 1 + countBlocks(block.content ?? []), 0);
}

function boundText(value: string, maxCharacters: number): { readonly text: string; readonly truncated: boolean } {
  const normalizedMax = Math.max(500, maxCharacters);

  if (value.length <= normalizedMax) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, normalizedMax).trimEnd()}\n[Context truncated at ${normalizedMax.toLocaleString()} characters.]`,
    truncated: true
  };
}

function previewText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 360 ? `${normalized.slice(0, 357)}...` : normalized;
}

function formatBytes(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"] as const;
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}
