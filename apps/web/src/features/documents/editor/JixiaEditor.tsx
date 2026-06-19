import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import {
  BlockNoteSchema,
  type BlockNoteEditor,
  type PartialBlock,
} from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { createReactBlockSpec, useCreateBlockNote } from "@blocknote/react";
import {
  type AttachmentBlockType,
  currentEditorSchemaVersion,
  editorBlockTypes,
  type EditorBlock,
  type EditorBlockAttributes,
  type EditorBlockType,
  type EditorSnapshot
} from "@jixia/shared";
import { forwardRef, type ReactElement, useEffect, useImperativeHandle, useRef, useState } from "react";

import { AttachmentBlock } from "../../attachments/AttachmentBlock";
import { Button } from "../../layout/workbench";

export type JixiaEditorHandle = {
  readonly exportSnapshot: () => EditorSnapshot;
};

type JixiaEditorProps = {
  readonly documentId: string;
  readonly documentVersionKey?: string;
  readonly value: EditorSnapshot;
  readonly onChange: (nextSnapshot: EditorSnapshot) => void;
  readonly readOnly?: boolean;
};

const jixiaImageBlock = createJixiaAttachmentBlockSpec("image");
const jixiaFileBlock = createJixiaAttachmentBlockSpec("file");
const jixiaCalloutBlock = createJixiaCalloutBlockSpec();

const jixiaBlockNoteSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    jixiaCallout: jixiaCalloutBlock(),
    jixiaImage: jixiaImageBlock(),
    jixiaFile: jixiaFileBlock()
  }
});

type JixiaBlockNoteEditor = BlockNoteEditor;
type JixiaBlockNoteBlock = {
  readonly id: string;
  readonly type: string;
  readonly props: Record<string, unknown>;
  readonly content?: unknown;
  readonly children: readonly JixiaBlockNoteBlock[];
};
type JixiaBlockNotePartialBlock = {
  readonly id?: string;
  readonly type?: string;
  readonly props?: Record<string, boolean | number | string>;
  readonly content?: unknown;
  readonly children?: readonly JixiaBlockNotePartialBlock[];
};

type JixiaBlockNoteViewProps = {
  readonly "data-testid": string;
  readonly emojiPicker: false;
  readonly editable: boolean;
  readonly editor: JixiaBlockNoteEditor;
  readonly filePanel: false;
  readonly formattingToolbar: false;
  readonly linkToolbar: false;
  readonly onChange: () => void;
  readonly sideMenu: false;
  readonly slashMenu: boolean;
  readonly tableHandles: boolean;
  readonly theme: "light";
};

const JixiaBlockNoteView = BlockNoteView as unknown as (props: JixiaBlockNoteViewProps) => ReactElement;

type EditorBlockDraft = {
  readonly id: string;
  readonly type: EditorBlockType;
  readonly attrs?: EditorBlockAttributes | undefined;
  readonly content?: readonly EditorBlock[] | undefined;
  readonly text?: string | undefined;
  readonly attachmentId?: string | undefined;
};

const textBlockTypes = new Set<EditorBlockType>([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "todo",
  "quote",
  "callout",
  "codeBlock",
  "table"
]);

const blockLabels: Record<EditorBlockType, string> = {
  paragraph: "Paragraph",
  heading: "Heading",
  bulletList: "Bullet list",
  orderedList: "Numbered list",
  todo: "Checklist item",
  quote: "Quote",
  callout: "Callout",
  codeBlock: "Code block",
  divider: "Divider",
  table: "Simple table",
  image: "Image attachment",
  file: "File attachment"
};

type AttachmentEditorBlock = EditorBlock & {
  readonly type: AttachmentBlockType;
};

export const JixiaEditor = forwardRef<JixiaEditorHandle, JixiaEditorProps>(function JixiaEditor(
  { documentId, documentVersionKey = documentId, value, onChange, readOnly = false },
  ref
) {
  const [insertType, setInsertType] = useState<EditorBlockType>("paragraph");
  const lastSnapshotRef = useRef<EditorSnapshot>(ensureSnapshotHasBlocks(value));
  const skipNextChangeRef = useRef(false);
  const initialDocumentVersionKeyRef = useRef(documentVersionKey);
  const initialContentRef = useRef(snapshotToBlockNoteBlocks(value));

  if (initialDocumentVersionKeyRef.current !== documentVersionKey) {
    initialDocumentVersionKeyRef.current = documentVersionKey;
    initialContentRef.current = snapshotToBlockNoteBlocks(value);
  }

  const editor = useCreateBlockNote(
    {
      schema: jixiaBlockNoteSchema,
      initialContent: initialContentRef.current as unknown as PartialBlock[],
      defaultStyles: true,
      setIdAttribute: true,
      tabBehavior: "prefer-indent",
      tables: {
        headers: true,
        splitCells: false,
        cellBackgroundColor: false,
        cellTextColor: false
      },
      domAttributes: {
        editor: {
          "aria-label": "Jixia BlockNote editor"
        }
      }
    },
    [documentVersionKey]
  );
  editor.documentId = documentId;
  editor.isEditable = !readOnly;

  useImperativeHandle(ref, () => ({
    exportSnapshot: () => exportEditorSnapshot(editor)
  }), [editor]);

  useEffect(() => {
    lastSnapshotRef.current = ensureSnapshotHasBlocks(value);
  }, [value]);

  function commitRuntimeSnapshot(): void {
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = false;
      return;
    }

    publishRuntimeSnapshot();
  }

  function publishRuntimeSnapshot(): void {
    const nextSnapshot = exportEditorSnapshot(editor);
    lastSnapshotRef.current = nextSnapshot;
    onChange(nextSnapshot);
  }

  function insertBlock(type: EditorBlockType): void {
    if (readOnly) {
      return;
    }

    const currentBlocks = editor.document;
    const referenceBlock = currentBlocks.at(-1);
    if (!referenceBlock) {
      skipNextChangeRef.current = true;
      editor.replaceBlocks(editor.document, [editorBlockToBlockNoteBlock(createBlock(type, 1))] as unknown as PartialBlock[]);
      publishRuntimeSnapshot();
      return;
    }

    editor.insertBlocks(
      [editorBlockToBlockNoteBlock(createBlock(type, currentBlocks.length + 1))] as unknown as PartialBlock[],
      referenceBlock,
      "after"
    );
  }

  return (
    <section aria-label="Jixia document editor" className="jixia-writing-canvas">
      <div className="jixia-writing-canvas__chrome">
        <span>
          BlockNote adapter · {lastSnapshotRef.current.blocks.length} {lastSnapshotRef.current.blocks.length === 1 ? "block" : "blocks"}
        </span>
        <div className="jixia-writing-canvas__insert" aria-label="Insert block controls">
          <label className="jixia-editor-insert-select">
            <span>Insert</span>
            <select
              aria-label="Insert block type"
              disabled={readOnly}
              onChange={(event) => setInsertType(event.currentTarget.value as EditorBlockType)}
              value={insertType}
            >
              {editorBlockTypes.map((type) => (
                <option key={type} value={type}>
                  {blockLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={readOnly} onClick={() => insertBlock(insertType)}>
            Insert block
          </Button>
        </div>
      </div>

      <div className="jixia-blocknote-shell" data-readonly={readOnly ? "true" : "false"}>
        <JixiaBlockNoteView
          data-testid="jixia-blocknote-view"
          emojiPicker={false}
          editable={!readOnly}
          editor={editor}
          filePanel={false}
          formattingToolbar={false}
          linkToolbar={false}
          onChange={commitRuntimeSnapshot}
          sideMenu={false}
          slashMenu={!readOnly}
          tableHandles={!readOnly}
          theme="light"
        />
      </div>
    </section>
  );
});

export function snapshotToBlockNoteBlocks(snapshot: EditorSnapshot): JixiaBlockNotePartialBlock[] {
  const blocks = snapshot.blocks.length > 0 ? snapshot.blocks : [createBlock("paragraph", 1)];
  const usedIds = new Set<string>();
  return blocks.map((block, index) => editorBlockToBlockNoteBlock(normalizeBlockId(block, usedIds, index)));
}

export function blockNoteBlocksToSnapshot(blocks: readonly JixiaBlockNotePartialBlock[]): EditorSnapshot {
  const editorBlocks = blocks.map(blockNoteBlockToEditorBlock).flat();

  return {
    editorSchemaVersion: currentEditorSchemaVersion,
    blocks: editorBlocks.length > 0 ? editorBlocks : [createBlock("paragraph", 1)]
  };
}

function exportEditorSnapshot(editor: JixiaBlockNoteEditor): EditorSnapshot {
  return blockNoteBlocksToSnapshot(editor.document as unknown as readonly JixiaBlockNotePartialBlock[]);
}

function editorBlockToBlockNoteBlock(block: EditorBlock): JixiaBlockNotePartialBlock {
  const children = block.content?.map(editorBlockToBlockNoteBlock) ?? [];

  switch (block.type) {
    case "heading":
      return {
        id: block.id,
        type: "heading",
        props: { level: headingLevel(block) },
        content: block.text ?? "",
        children
      };
    case "bulletList":
      return {
        id: block.id,
        type: "bulletListItem",
        content: block.text ?? "",
        children
      };
    case "orderedList":
      return {
        id: block.id,
        type: "numberedListItem",
        content: block.text ?? "",
        children
      };
    case "todo":
      return {
        id: block.id,
        type: "checkListItem",
        props: { checked: Boolean(block.attrs?.checked) },
        content: block.text ?? "",
        children
      };
    case "quote":
      return {
        id: block.id,
        type: "quote",
        content: block.text ?? "",
        children
      };
    case "callout":
      return {
        id: block.id,
        type: "jixiaCallout",
        props: { tone: readStringAttr(block.attrs, "tone") ?? "note" },
        content: block.text ?? "",
        children
      };
    case "codeBlock":
      return {
        id: block.id,
        type: "codeBlock",
        props: { language: readStringAttr(block.attrs, "language") ?? "text" },
        content: block.text ?? "",
        children
      };
    case "divider":
      return {
        id: block.id,
        type: "divider",
        children
      };
    case "table":
      return markdownTableBlockToBlockNoteTable(block);
    case "image":
      return attachmentBlockToBlockNoteBlock(block, "jixiaImage");
    case "file":
      return attachmentBlockToBlockNoteBlock(block, "jixiaFile");
    case "paragraph":
    default:
      return {
        id: block.id,
        type: "paragraph",
        content: block.text ?? blockTextFallback(block),
        children
      };
  }
}

function normalizeBlockId(block: EditorBlock, usedIds: Set<string>, index: number): EditorBlock {
  const id = sanitizeBlockId(block.id, block.type, index);
  const uniqueId = usedIds.has(id) ? `${id}-${index + 1}` : id;
  usedIds.add(uniqueId);

  return {
    ...block,
    id: uniqueId,
    ...(block.content
      ? {
          content: block.content.map((childBlock, childIndex) =>
            normalizeBlockId(childBlock, usedIds, index + childIndex + 1)
          )
        }
      : {})
  };
}

function sanitizeBlockId(id: string, type: EditorBlockType, index: number): string {
  const trimmedId = id.trim();
  return trimmedId.length > 0 && /^[A-Za-z0-9_-]+$/.test(trimmedId)
    ? trimmedId
    : `${type}-${index + 1}`;
}

function blockNoteBlockToEditorBlock(block: JixiaBlockNotePartialBlock): readonly EditorBlock[] {
  const blockType = block.type ?? "paragraph";
  const blockId = block.id ?? generatedBlockId(blockType);
  const blockProps = block.props ?? {};
  const content = (block.children ?? []).map(blockNoteBlockToEditorBlock).flat();

  switch (blockType) {
    case "heading":
      return [compactBlock({ id: blockId, type: "heading", attrs: { level: readNumberProp(blockProps, "level") ?? 1 }, text: inlineText(block.content), content })];
    case "bulletListItem":
      return [compactBlock({ id: blockId, type: "bulletList", text: inlineText(block.content), content })];
    case "numberedListItem":
      return [compactBlock({ id: blockId, type: "orderedList", text: inlineText(block.content), content })];
    case "checkListItem":
      return [compactBlock({ id: blockId, type: "todo", attrs: { checked: Boolean(readBooleanProp(blockProps, "checked")) }, text: inlineText(block.content), content })];
    case "quote":
      return [compactBlock({ id: blockId, type: "quote", text: inlineText(block.content), content })];
    case "jixiaCallout":
      return [compactBlock({ id: blockId, type: "callout", attrs: { tone: readStringProp(blockProps, "tone") ?? "note" }, text: inlineText(block.content), content })];
    case "codeBlock":
      return [compactBlock({ id: blockId, type: "codeBlock", attrs: { language: readStringProp(blockProps, "language") ?? "text" }, text: inlineText(block.content), content })];
    case "divider":
      return [compactBlock({ id: blockId, type: "divider", content })];
    case "table":
      return [compactBlock({ id: blockId, type: "table", text: tableContentToMarkdown(block.content), content })];
    case "jixiaImage":
      return [blockNoteAttachmentBlockToEditorBlock(block, "image")];
    case "jixiaFile":
      return [blockNoteAttachmentBlockToEditorBlock(block, "file")];
    case "paragraph":
      return [compactBlock({ id: blockId, type: "paragraph", text: inlineText(block.content), content })];
    default:
      return [compactBlock({ id: blockId, type: "paragraph", text: blockContentText(block.content), content })];
  }
}

function attachmentBlockToBlockNoteBlock(block: EditorBlock, type: "jixiaImage" | "jixiaFile"): JixiaBlockNotePartialBlock {
  const metadata = readAttachmentMetadata(block.attrs?.attachment);

  return {
    id: block.id,
    type,
    props: {
      attachmentId: block.attachmentId ?? "",
      fileName: metadata?.fileName ?? "",
      mimeType: metadata?.mimeType ?? "",
      sizeBytes: metadata?.sizeBytes ?? 0,
      checksum: metadata?.checksum ?? "",
      uploadedAt: metadata?.uploadedAt ?? ""
    },
    children: block.content?.map(editorBlockToBlockNoteBlock) ?? []
  };
}

function blockNoteAttachmentBlockToEditorBlock(
  block: JixiaBlockNotePartialBlock,
  type: AttachmentBlockType
): EditorBlock {
  const blockProps = block.props ?? {};
  const attachmentId = readStringProp(blockProps, "attachmentId");
  const fileName = readStringProp(blockProps, "fileName");
  const mimeType = readStringProp(blockProps, "mimeType");
  const sizeBytes = readNumberProp(blockProps, "sizeBytes");
  const uploadedAt = readStringProp(blockProps, "uploadedAt");
  const checksum = readStringProp(blockProps, "checksum");
  const content = (block.children ?? []).map(blockNoteBlockToEditorBlock).flat();

  return compactBlock({
    id: block.id ?? generatedBlockId(type),
    type,
    attachmentId,
    attrs: fileName && mimeType && sizeBytes !== undefined && uploadedAt
      ? {
          attachment: {
            fileName,
            mimeType,
            sizeBytes,
            checksum: checksum || null,
            uploadedAt
          }
        }
      : undefined,
    content
  });
}

function generatedBlockId(type: string): string {
  return `${type || "paragraph"}-${Date.now().toString(36)}`;
}

function markdownTableBlockToBlockNoteTable(block: EditorBlock): JixiaBlockNotePartialBlock {
  const rows = parseMarkdownTable(block.text ?? "");
  return {
    id: block.id,
    type: "table",
    content: {
      type: "tableContent",
      rows: rows.map((cells) => ({ cells: cells.map(tableTextCell) })),
      columnWidths: []
    },
    children: block.content?.map(editorBlockToBlockNoteBlock) ?? []
  };
}

function tableTextCell(text: string): {
  readonly type: "tableCell";
  readonly content: readonly { readonly type: "text"; readonly text: string; readonly styles: Record<string, never> }[];
  readonly props: {
    readonly backgroundColor: "default";
    readonly colspan: 1;
    readonly rowspan: 1;
    readonly textAlignment: "left";
    readonly textColor: "default";
  };
} {
  return {
    type: "tableCell",
    content: [{ type: "text", text, styles: {} }],
    props: {
      backgroundColor: "default",
      colspan: 1,
      rowspan: 1,
      textAlignment: "left",
      textColor: "default"
    }
  };
}

function parseMarkdownTable(value: string): string[][] {
  const parsedRows = value
    .split("\n")
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .map((row) => row.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()))
    .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));

  if (parsedRows.length > 0) {
    return parsedRows;
  }

  return [["Column", "Value"], ["", ""]];
}

function tableContentToMarkdown(content: JixiaBlockNoteBlock["content"]): string {
  if (!isTableContent(content)) {
    return "| Column | Value |\n| --- | --- |\n|  |  |";
  }

  const rows = content.rows.map((row) => row.cells.map((cell) => tableCellToText(cell)));
  if (rows.length === 0) {
    return "| Column | Value |\n| --- | --- |\n|  |  |";
  }

  const [head, ...body] = rows;
  const header = head ?? ["Column", "Value"];
  const divider = header.map(() => "---");
  return [header, divider, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function tableCellToText(cell: unknown): string {
  if (Array.isArray(cell)) {
    return blockContentText(cell);
  }

  if (isRecord(cell) && Array.isArray(cell.content)) {
    return blockContentText(cell.content);
  }

  return "";
}

function inlineText(content: JixiaBlockNoteBlock["content"]): string {
  return blockContentText(content);
}

function blockContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content.map((entry) => inlineEntryText(entry)).join("");
}

function inlineEntryText(entry: unknown): string {
  if (typeof entry === "string") {
    return entry;
  }

  if (!isRecord(entry)) {
    return "";
  }

  if (typeof entry.text === "string") {
    return entry.text;
  }

  if (Array.isArray(entry.content)) {
    return blockContentText(entry.content);
  }

  if (typeof entry.content === "string") {
    return entry.content;
  }

  return "";
}

function createJixiaAttachmentBlockSpec(type: AttachmentBlockType) {
  const blockType = type === "image" ? "jixiaImage" : "jixiaFile";
  const label = type === "image" ? "image" : "file";
  const meta = type === "image"
    ? { selectable: true, isolating: true, fileBlockAccept: ["image/*"] }
    : { selectable: true, isolating: true };

  return createReactBlockSpec(
    {
      type: blockType,
      propSchema: {
        attachmentId: { default: "" },
        fileName: { default: "" },
        mimeType: { default: "" },
        sizeBytes: { default: 0 },
        checksum: { default: "" },
        uploadedAt: { default: "" }
      },
      content: "none"
    },
    {
      meta,
      render: ({ block, editor }) => (
        <AttachmentBlock
          block={attachmentPropsToEditorBlock(block.id, type, block.props)}
          documentId={editor.documentId ?? ""}
          index={blockIndex(editor, block.id)}
          onChange={(nextBlock) => {
            editor.updateBlock(block.id, {
              props: editorBlockAttachmentProps(nextBlock)
            });
          }}
          readOnly={!editor.isEditable}
        />
      ),
      toExternalHTML: ({ block }) => (
        <section data-jixia-attachment-id={block.props.attachmentId} data-jixia-block-type={label}>
          {block.props.fileName || `${label} attachment`}
        </section>
      )
    }
  );
}

function createJixiaCalloutBlockSpec() {
  return createReactBlockSpec(
    {
      type: "jixiaCallout",
      propSchema: {
        tone: { default: "note" }
      },
      content: "inline"
    },
    {
      render: ({ block, contentRef }) => (
        <section className="jixia-blocknote-callout" data-tone={block.props.tone}>
          <span aria-hidden="true">◆</span>
          <div ref={contentRef} />
        </section>
      ),
      toExternalHTML: ({ contentRef }) => <aside ref={contentRef} />
    }
  );
}

function attachmentPropsToEditorBlock(
  id: string,
  type: AttachmentBlockType,
  props: Record<string, boolean | number | string>
): AttachmentEditorBlock {
  const attachmentId = readStringProp(props, "attachmentId");
  const fileName = readStringProp(props, "fileName");
  const mimeType = readStringProp(props, "mimeType");
  const sizeBytes = readNumberProp(props, "sizeBytes");
  const checksum = readStringProp(props, "checksum");
  const uploadedAt = readStringProp(props, "uploadedAt");

  return compactBlock({
    id,
    type,
    attachmentId,
    attrs: fileName && mimeType && sizeBytes !== undefined && uploadedAt
      ? {
          attachment: {
            fileName,
            mimeType,
            sizeBytes,
            checksum: checksum || null,
            uploadedAt
          }
        }
      : undefined
  }) as AttachmentEditorBlock;
}

function editorBlockAttachmentProps(block: EditorBlock): Record<string, boolean | number | string> {
  const metadata = readAttachmentMetadata(block.attrs?.attachment);

  return {
    attachmentId: block.attachmentId ?? "",
    fileName: metadata?.fileName ?? "",
    mimeType: metadata?.mimeType ?? "",
    sizeBytes: metadata?.sizeBytes ?? 0,
    checksum: metadata?.checksum ?? "",
    uploadedAt: metadata?.uploadedAt ?? ""
  };
}

function blockIndex(editor: { readonly document: readonly { readonly id: string }[] }, blockId: string): number {
  return Math.max(0, editor.document.findIndex((block) => block.id === blockId));
}

function createBlock(type: EditorBlockType, index: number): EditorBlock {
  const id = `${type}-${index}-${Date.now().toString(36)}`;

  switch (type) {
    case "heading":
      return { id, type, attrs: { level: 2 }, text: "" };
    case "todo":
      return { id, type, attrs: { checked: false }, text: "" };
    case "callout":
      return { id, type, attrs: { tone: "note" }, text: "" };
    case "divider":
      return { id, type };
    case "table":
      return { id, type, text: "| Column | Value |\n| --- | --- |\n|  |  |" };
    case "image":
    case "file":
      return { id, type };
    default:
      return { id, type, text: "" };
  }
}

function headingLevel(block: EditorBlock): 1 | 2 | 3 | 4 | 5 | 6 {
  const level = block.attrs?.level;
  return typeof level === "number" && [1, 2, 3, 4, 5, 6].includes(level) ? (level as 1 | 2 | 3 | 4 | 5 | 6) : 2;
}

function blockTextFallback(block: EditorBlock): string {
  if (textBlockTypes.has(block.type)) {
    return block.text ?? "";
  }

  return "";
}

function ensureSnapshotHasBlocks(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    editorSchemaVersion: currentEditorSchemaVersion,
    blocks: snapshot.blocks.length > 0 ? snapshot.blocks : [createBlock("paragraph", 1)]
  };
}

function compactBlock(block: EditorBlockDraft): EditorBlock {
  return {
    id: block.id,
    type: block.type,
    ...(block.attrs ? { attrs: block.attrs } : {}),
    ...(block.content && block.content.length > 0 ? { content: block.content } : {}),
    ...(block.text !== undefined ? { text: block.text } : {}),
    ...(block.attachmentId ? { attachmentId: block.attachmentId } : {})
  };
}

function readAttachmentMetadata(value: unknown) {
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

function readStringAttr(blockAttrs: EditorBlock["attrs"], key: string): string | undefined {
  const value = blockAttrs?.[key];
  return typeof value === "string" ? value : undefined;
}

function readStringProp(props: Record<string, unknown>, key: string): string | undefined {
  const value = props[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberProp(props: Record<string, unknown>, key: string): number | undefined {
  const value = props[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBooleanProp(props: Record<string, unknown>, key: string): boolean | undefined {
  const value = props[key];
  return typeof value === "boolean" ? value : undefined;
}

function isTableContent(value: unknown): value is { readonly rows: readonly { readonly cells: readonly unknown[] }[] } {
  return isRecord(value) && Array.isArray(value.rows);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

declare module "@blocknote/core" {
  interface BlockNoteEditor<BSchema, ISchema, SSchema> {
    documentId?: string;
  }
}
