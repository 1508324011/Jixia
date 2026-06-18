import {
  currentEditorSchemaVersion,
  editorBlockTypes,
  emptyEditorSnapshot as sharedEmptyEditorSnapshot,
  isSupportedEditorBlockType,
  type EditorBlock,
  type EditorBlockAttributes,
  type EditorBlockType,
  type EditorSnapshot
} from "@jixia/shared";

export const currentDocumentEditorSchemaVersion = currentEditorSchemaVersion;
export const supportedEditorBlockTypes = editorBlockTypes;

export class EditorSchemaError extends Error {
  constructor(message = "Invalid editor snapshot") {
    super(message);
    this.name = "EditorSchemaError";
  }
}

export const emptyEditorSnapshot: EditorSnapshot = sharedEmptyEditorSnapshot;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EditorSchemaError();
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)])
    );
  }

  throw new EditorSchemaError();
}

function cloneAttributes(value: unknown): EditorBlockAttributes {
  if (!isPlainObject(value)) {
    throw new EditorSchemaError();
  }

  return cloneJsonValue(value) as EditorBlockAttributes;
}

function normalizeString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new EditorSchemaError(`Invalid editor block ${fieldName}`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue || trimmedValue.length > 512) {
    throw new EditorSchemaError(`Invalid editor block ${fieldName}`);
  }

  return trimmedValue;
}

function normalizeBlockType(value: unknown): EditorBlockType {
  if (typeof value !== "string" || !isSupportedEditorBlockType(value)) {
    throw new EditorSchemaError("Unsupported editor block type");
  }

  return value;
}

function normalizeBlock(value: unknown): EditorBlock {
  if (!isPlainObject(value)) {
    throw new EditorSchemaError("Invalid editor block");
  }

  const block: {
    id: string;
    type: EditorBlockType;
    attrs?: EditorBlockAttributes;
    content?: EditorBlock[];
    text?: string;
    attachmentId?: string;
  } = {
    id: normalizeString(value.id, "id"),
    type: normalizeBlockType(value.type)
  };

  if ("attrs" in value && value.attrs !== undefined) {
    block.attrs = cloneAttributes(value.attrs);
  }

  if ("content" in value && value.content !== undefined) {
    if (!Array.isArray(value.content)) {
      throw new EditorSchemaError("Invalid editor block content");
    }

    block.content = value.content.map((child) => normalizeBlock(child));
  }

  if ("text" in value && value.text !== undefined) {
    if (typeof value.text !== "string") {
      throw new EditorSchemaError("Invalid editor block text");
    }

    block.text = value.text;
  }

  if ("attachmentId" in value && value.attachmentId !== undefined) {
    block.attachmentId = normalizeString(value.attachmentId, "attachmentId");
  }

  return block;
}

function normalizeSchemaVersion(value: unknown): void {
  if (value === undefined) {
    return;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > currentDocumentEditorSchemaVersion
  ) {
    throw new EditorSchemaError("Unsupported editor schema version");
  }
}

export function createEmptyEditorSnapshot(): EditorSnapshot {
  return normalizeEditorSnapshot(emptyEditorSnapshot);
}

export function normalizeEditorSnapshot(value: unknown): EditorSnapshot {
  if (!isPlainObject(value)) {
    throw new EditorSchemaError();
  }

  normalizeSchemaVersion(value.editorSchemaVersion);

  if (!Array.isArray(value.blocks)) {
    throw new EditorSchemaError("Invalid editor blocks");
  }

  const blocks = value.blocks.map((block) => normalizeBlock(block));

  return {
    editorSchemaVersion: currentDocumentEditorSchemaVersion,
    blocks: blocks.length > 0 ? blocks : createEmptyEditorSnapshot().blocks
  };
}
