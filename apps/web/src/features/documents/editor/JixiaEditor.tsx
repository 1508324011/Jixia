import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import {
  BlockNoteSchema,
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
import {
  type ClipboardEvent,
  type DragEvent,
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";

import { AttachmentBlock } from "../../attachments/AttachmentBlock";
import { uploadAttachment, type UploadedAttachmentResult } from "../../attachments/uploadAttachment";
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
const jixiaCodeBlock = createJixiaCodeBlockSpec();

const jixiaBlockNoteSchema = BlockNoteSchema.create().extend({
  blockSpecs: {
    jixiaCallout: jixiaCalloutBlock(),
    jixiaCodeBlock: jixiaCodeBlock(),
    jixiaImage: jixiaImageBlock(),
    jixiaFile: jixiaFileBlock()
  }
});

type JixiaBlockNoteEditor = {
  documentId?: string;
  isEditable?: boolean;
  readonly document: readonly { readonly id: string }[];
  readonly getTextCursorPosition?: () => { readonly block?: { readonly id: string } };
  readonly insertBlocks: (blocks: readonly PartialBlock[], referenceBlock: { readonly id: string }, placement: "after" | "before") => void;
  readonly removeBlocks: (blocks: readonly string[]) => void;
  readonly replaceBlocks: (blocksToRemove: readonly { readonly id: string }[], blocksToInsert: readonly PartialBlock[]) => void;
  readonly updateBlock: (block: string, update: { readonly props?: Record<string, boolean | number | string> }) => void;
};
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

type AttachmentUploadStatus = "uploading" | "success" | "error";

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

const codeLanguageOptions = [
  "text",
  "bash",
  "css",
  "html",
  "json",
  "js",
  "markdown",
  "python",
  "r",
  "sql",
  "ts",
  "tsx",
  "typescript",
  "yaml"
] as const;
type CodeLanguageOption = (typeof codeLanguageOptions)[number];
const codeLanguageOptionSet = new Set<string>(codeLanguageOptions);
let generatedBlockSequence = 0;

type AttachmentEditorBlock = EditorBlock & {
  readonly type: AttachmentBlockType;
};

export const JixiaEditor = forwardRef<JixiaEditorHandle, JixiaEditorProps>(function JixiaEditor(
  { documentId, documentVersionKey = documentId, value, onChange, readOnly = false },
  ref
) {
  const [insertType, setInsertType] = useState<EditorBlockType>("paragraph");
  const [dragState, setDragState] = useState<"idle" | "ready">("idle");
  const lastSnapshotRef = useRef<EditorSnapshot>(ensureSnapshotHasBlocks(value));
  const skipNextChangeRef = useRef(false);
  const initialDocumentVersionKeyRef = useRef(documentVersionKey);
  const initialContentRef = useRef(snapshotToBlockNoteBlocks(value));

  if (initialDocumentVersionKeyRef.current !== documentVersionKey) {
    initialDocumentVersionKeyRef.current = documentVersionKey;
    initialContentRef.current = snapshotToBlockNoteBlocks(value);
  }

  const blockNoteEditor = useCreateBlockNote(
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
  const editor = blockNoteEditor as unknown as JixiaBlockNoteEditor;
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
    const nextBlock = createBlock(type, currentBlocks.length + 1);
    const nextBlockNoteBlock = editorBlockToBlockNoteBlock(nextBlock);
    const referenceBlock = currentBlocks[currentBlocks.length - 1];
    if (!referenceBlock) {
      skipNextChangeRef.current = true;
      editor.replaceBlocks(editor.document, [nextBlockNoteBlock] as unknown as PartialBlock[]);
      publishRuntimeSnapshot();
      return;
    }

    editor.insertBlocks(
      [nextBlockNoteBlock] as unknown as PartialBlock[],
      referenceBlock,
      "after"
    );
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>): void {
    if (readOnly) {
      return;
    }

    const files = filesFromClipboardData(event.clipboardData);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    void insertUploadedFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (readOnly || !dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragState("ready");
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragState("idle");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    if (readOnly) {
      return;
    }

    const files = filesFromDataTransfer(event.dataTransfer);
    if (files.length === 0) {
      setDragState("idle");
      return;
    }

    event.preventDefault();
    setDragState("idle");
    void insertUploadedFiles(files);
  }

  async function insertUploadedFiles(files: readonly File[]): Promise<void> {
    for (const file of files) {
      const blockType = attachmentBlockTypeForFile(file);
      const blockId = generatedBlockId(blockType);
      insertPartialBlockAtCursor(editor, attachmentUploadPlaceholderBlock(blockId, blockType, file));

      try {
        const uploadedAttachment = await uploadAttachment({
          documentId,
          blockType,
          file
        });
        editor.updateBlock(blockId, {
          props: uploadedAttachmentProps(uploadedAttachment, "success", "Attachment uploaded and linked to this block.")
        });
      } catch (error) {
        editor.updateBlock(blockId, {
          props: attachmentUploadProps(
            blockType,
            file,
            "error",
            error instanceof Error ? error.message : "Unable to upload attachment."
          )
        });
      }
    }
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

      <div
        className="jixia-blocknote-shell"
        data-drag-state={dragState}
        data-readonly={readOnly ? "true" : "false"}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {!readOnly ? (
          <p className="jixia-blocknote-shell__drop-hint" role="status">
            Drop or paste images/files to upload them into this document.
          </p>
        ) : null}
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
        type: "jixiaCodeBlock",
        props: codeBlockProps(block),
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
    case "jixiaCodeBlock":
      return [compactBlock({ id: blockId, type: "codeBlock", attrs: codeBlockAttrs(blockProps), text: inlineText(block.content), content })];
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
      uploadedAt: metadata?.uploadedAt ?? "",
      ...attachmentDisplayMetadataProps(block.attrs, block.type as AttachmentBlockType)
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
  const attachmentMetadata = fileName && mimeType && sizeBytes !== undefined && uploadedAt
    ? {
        fileName,
        mimeType,
        sizeBytes,
        checksum: checksum || null,
        uploadedAt
      }
    : undefined;
  const attrs = compactAttrs({
    ...(attachmentMetadata ? { attachment: attachmentMetadata } : {}),
    ...attachmentDisplayMetadataAttrs(blockProps, type)
  });
  const content = (block.children ?? []).map(blockNoteBlockToEditorBlock).flat();

  return compactBlock({
    id: block.id ?? generatedBlockId(type),
    type,
    attachmentId,
    attrs,
    content
  });
}

function generatedBlockId(type: string): string {
  generatedBlockSequence += 1;
  return `${type || "paragraph"}-${Date.now().toString(36)}-${generatedBlockSequence.toString(36)}`;
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

  if (entry.type === "hardBreak") {
    return "\n";
  }

  if (Array.isArray(entry.content)) {
    return blockContentText(entry.content);
  }

  if (typeof entry.content === "string") {
    return entry.content;
  }

  return "";
}

function createJixiaCodeBlockSpec() {
  return createReactBlockSpec(
    {
      type: "jixiaCodeBlock",
      propSchema: {
        language: { default: "text" },
        wrap: { default: false },
        hasWrap: { default: false }
      },
      content: "inline"
    },
    {
      meta: {
        selectable: true
      },
      render: ({ block, contentRef, editor }) => {
        const language = typeof block.props.language === "string" ? block.props.language : "text";
        const wrap = Boolean(block.props.wrap);
        const hasWrap = Boolean(block.props.hasWrap);
        const isEditable = (editor as unknown as { readonly isEditable?: boolean }).isEditable !== false;

        return (
          <section className="jixia-code-block" data-wrap={wrap ? "true" : "false"}>
            <div className="jixia-code-block__toolbar" contentEditable={false}>
              {isEditable ? (
                <label className="jixia-code-block__language">
                  <span>Language</span>
                  <select
                    aria-label="Code block language"
                    onChange={(event) => {
                      editor.updateBlock(block.id, {
                        props: {
                          language: event.currentTarget.value,
                          wrap,
                          hasWrap
                        }
                      });
                    }}
                    value={language}
                  >
                    {codeLanguageOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span aria-label="Code block language" className="jixia-code-block__language">
                  <span>Language</span>
                  {language}
                </span>
              )}
              <button
                aria-label="Copy code block"
                className="jixia-code-block__control"
                onClick={(event) => {
                  const codeBlock = event.currentTarget.closest(".jixia-code-block");
                  const codeText = codeBlock?.querySelector(".jixia-code-block__content")?.textContent ?? "";
                  void navigator.clipboard?.writeText(codeText);
                }}
                type="button"
              >
                Copy
              </button>
              {isEditable ? (
                <button
                  aria-label={wrap ? "Disable code wrapping" : "Enable code wrapping"}
                  aria-pressed={wrap}
                  className="jixia-code-block__control"
                  onClick={() => {
                    editor.updateBlock(block.id, {
                      props: {
                        language,
                        wrap: !wrap,
                        hasWrap: true
                      }
                    });
                  }}
                  type="button"
                >
                  {wrap ? "Unwrap" : "Wrap"}
                </button>
              ) : null}
            </div>
            <pre className="jixia-code-block__pre">
              <code className="jixia-code-block__content" ref={contentRef} spellCheck={false} />
            </pre>
          </section>
        );
      },
      toExternalHTML: ({ contentRef }) => <pre><code ref={contentRef} /></pre>
    }
  );
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
        uploadedAt: { default: "" },
        caption: { default: "" },
        altText: { default: "" },
        description: { default: "" },
        previewWidth: { default: 420 },
        showPreview: { default: type === "image" },
        hasCaption: { default: false },
        hasAltText: { default: false },
        hasDescription: { default: false },
        hasPreviewWidth: { default: false },
        hasShowPreview: { default: false },
        uploadStatus: { default: "" },
        uploadMessage: { default: "" },
        pendingFileName: { default: "" },
        pendingMimeType: { default: "" },
        pendingSizeBytes: { default: 0 }
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
          onRemove={() => {
            editor.removeBlocks([block.id]);
          }}
          readOnly={!editor.isEditable}
          runtimeUpload={attachmentRuntimeUploadProps(block.props)}
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
  const attachmentMetadata = fileName && mimeType && sizeBytes !== undefined && uploadedAt
    ? {
        attachment: {
          fileName,
          mimeType,
          sizeBytes,
          checksum: checksum || null,
          uploadedAt
        }
      }
    : {};

  return compactBlock({
    id,
    type,
    attachmentId,
    attrs: compactAttrs({
      ...attachmentMetadata,
      ...attachmentDisplayMetadataAttrs(props, type)
    })
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
    uploadedAt: metadata?.uploadedAt ?? "",
    ...attachmentDisplayMetadataProps(block.attrs, block.type as AttachmentBlockType)
  };
}

function blockIndex(editor: { readonly document: readonly { readonly id: string }[] }, blockId: string): number {
  return Math.max(0, editor.document.findIndex((block) => block.id === blockId));
}

function attachmentDisplayMetadataProps(
  attrs: EditorBlock["attrs"],
  type: AttachmentBlockType
): Record<string, boolean | number | string> {
  const metadata = attachmentDisplayMetadataAttrs(attrs ?? {}, type);

  return {
    caption: typeof metadata.caption === "string" ? metadata.caption : "",
    altText: typeof metadata.altText === "string" ? metadata.altText : "",
    description: typeof metadata.description === "string" ? metadata.description : "",
    previewWidth: typeof metadata.previewWidth === "number" ? metadata.previewWidth : 420,
    showPreview: typeof metadata.showPreview === "boolean" ? metadata.showPreview : type === "image",
    hasCaption: typeof metadata.caption === "string",
    hasAltText: typeof metadata.altText === "string",
    hasDescription: typeof metadata.description === "string",
    hasPreviewWidth: typeof metadata.previewWidth === "number",
    hasShowPreview: typeof metadata.showPreview === "boolean"
  };
}

function attachmentDisplayMetadataAttrs(
  props: Record<string, unknown>,
  type: AttachmentBlockType
): EditorBlockAttributes {
  const hasCaption = hasAuthoredAttachmentProp(props, "hasCaption", safeDisplayText(readStringProp(props, "caption")) !== undefined);
  const hasAltText = hasAuthoredAttachmentProp(props, "hasAltText", safeDisplayText(readStringProp(props, "altText")) !== undefined);
  const hasDescription = hasAuthoredAttachmentProp(props, "hasDescription", safeDisplayText(readStringProp(props, "description")) !== undefined);
  const hasPreviewWidth = hasAuthoredAttachmentProp(props, "hasPreviewWidth", safePreviewWidth(readNumberProp(props, "previewWidth")) !== undefined);
  const hasShowPreview = hasAuthoredAttachmentProp(props, "hasShowPreview", readBooleanProp(props, "showPreview") !== undefined);

  return compactAttrs({
    ...(hasCaption ? { caption: safeDisplayText(readStringProp(props, "caption")) ?? "" } : {}),
    ...(type === "image" && hasAltText
      ? { altText: safeDisplayText(readStringProp(props, "altText")) ?? "" }
      : {}),
    ...(hasDescription
      ? { description: safeDisplayText(readStringProp(props, "description")) ?? "" }
      : {}),
    ...(hasPreviewWidth
      ? { previewWidth: safePreviewWidth(readNumberProp(props, "previewWidth")) ?? 420 }
      : {}),
    ...(hasShowPreview
      ? { showPreview: Boolean(readBooleanProp(props, "showPreview")) }
      : {})
  }) ?? {};
}

function hasAuthoredAttachmentProp(
  props: Record<string, unknown>,
  flag: string,
  fallback: boolean
): boolean {
  const explicitFlag = readBooleanProp(props, flag);
  return explicitFlag === undefined ? fallback : explicitFlag;
}

function safeDisplayText(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue.slice(0, 500) : undefined;
}

function safePreviewWidth(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(820, Math.max(160, Math.round(value)));
}

function compactAttrs(attrs: Record<string, unknown>): EditorBlockAttributes | undefined {
  return Object.keys(attrs).length > 0 ? attrs : undefined;
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
    case "codeBlock":
      return { id, type, attrs: { language: "text" }, text: "" };
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

function readBooleanAttr(blockAttrs: EditorBlock["attrs"], key: string): boolean | undefined {
  const value = blockAttrs?.[key];
  return typeof value === "boolean" ? value : undefined;
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

function codeBlockProps(block: EditorBlock): Record<string, boolean | number | string> {
  const wrap = readBooleanAttr(block.attrs, "wrap");

  return {
    language: safeCodeLanguage(readStringAttr(block.attrs, "language")),
    wrap: wrap ?? false,
    hasWrap: typeof wrap === "boolean"
  };
}

function codeBlockAttrs(props: Record<string, unknown>): EditorBlockAttributes {
  return compactAttrs({
    language: safeCodeLanguage(readStringProp(props, "language")),
    ...(readBooleanProp(props, "hasWrap") ? { wrap: Boolean(readBooleanProp(props, "wrap")) } : {})
  }) ?? { language: "text" };
}

function safeCodeLanguage(value: string | undefined): CodeLanguageOption {
  const normalizedLanguage = value?.trim().toLowerCase();
  return normalizedLanguage && codeLanguageOptionSet.has(normalizedLanguage)
    ? (normalizedLanguage as CodeLanguageOption)
    : "text";
}

function attachmentRuntimeUploadProps(props: Record<string, unknown>): {
  readonly status?: AttachmentUploadStatus;
  readonly message?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
} | undefined {
  const status = readAttachmentUploadStatus(props.uploadStatus);
  if (!status) {
    return undefined;
  }

  return compactAttrs({
    status,
    message: readStringProp(props, "uploadMessage"),
    fileName: readStringProp(props, "pendingFileName") || readStringProp(props, "fileName"),
    mimeType: readStringProp(props, "pendingMimeType") || readStringProp(props, "mimeType"),
    sizeBytes: readNumberProp(props, "pendingSizeBytes") ?? readNumberProp(props, "sizeBytes")
  }) as {
    readonly status?: AttachmentUploadStatus;
    readonly message?: string;
    readonly fileName?: string;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
  };
}

function readAttachmentUploadStatus(value: unknown): AttachmentUploadStatus | undefined {
  return value === "uploading" || value === "success" || value === "error" ? value : undefined;
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

function attachmentBlockTypeForFile(file: File): AttachmentBlockType {
  return file.type.toLowerCase().startsWith("image/") ? "image" : "file";
}

function insertPartialBlockAtCursor(editor: JixiaBlockNoteEditor, block: JixiaBlockNotePartialBlock): void {
  const referenceBlock = currentTextCursorBlock(editor) ?? editor.document[editor.document.length - 1];
  if (!referenceBlock) {
    editor.replaceBlocks(editor.document, [block] as unknown as PartialBlock[]);
    return;
  }

  editor.insertBlocks([block] as unknown as PartialBlock[], referenceBlock, "after");
}

function currentTextCursorBlock(editor: JixiaBlockNoteEditor): { readonly id: string } | undefined {
  try {
    return editor.getTextCursorPosition?.().block;
  } catch {
    return undefined;
  }
}

function attachmentUploadPlaceholderBlock(
  id: string,
  blockType: AttachmentBlockType,
  file: File
): JixiaBlockNotePartialBlock {
  return {
    id,
    type: blockType === "image" ? "jixiaImage" : "jixiaFile",
    props: attachmentUploadProps(blockType, file, "uploading", "Uploading through server-issued intent…"),
    children: []
  };
}

function attachmentUploadProps(
  blockType: AttachmentBlockType,
  file: File,
  status: AttachmentUploadStatus,
  message: string
): Record<string, boolean | number | string> {
  return {
    attachmentId: "",
    fileName: "",
    mimeType: "",
    sizeBytes: 0,
    checksum: "",
    uploadedAt: "",
    caption: "",
    altText: "",
    description: "",
    previewWidth: 420,
    showPreview: blockType === "image",
    hasCaption: false,
    hasAltText: false,
    hasDescription: false,
    hasPreviewWidth: false,
    hasShowPreview: false,
    uploadStatus: status,
    uploadMessage: safeRuntimeUploadMessage(message),
    pendingFileName: safeRuntimeFileName(file),
    pendingMimeType: safeRuntimeMimeType(file),
    pendingSizeBytes: file.size
  };
}

function uploadedAttachmentProps(
  uploadedAttachment: UploadedAttachmentResult,
  status: AttachmentUploadStatus,
  message: string
): Record<string, boolean | number | string> {
  return {
    attachmentId: uploadedAttachment.attachmentId,
    fileName: uploadedAttachment.fileName,
    mimeType: uploadedAttachment.mimeType,
    sizeBytes: uploadedAttachment.sizeBytes,
    checksum: uploadedAttachment.checksum ?? "",
    uploadedAt: uploadedAttachment.createdAt,
    caption: "",
    altText: "",
    description: "",
    previewWidth: 420,
    showPreview: uploadedAttachment.blockType === "image",
    hasCaption: false,
    hasAltText: false,
    hasDescription: false,
    hasPreviewWidth: false,
    hasShowPreview: false,
    uploadStatus: status,
    uploadMessage: safeRuntimeUploadMessage(message),
    pendingFileName: "",
    pendingMimeType: "",
    pendingSizeBytes: 0
  };
}

function safeRuntimeFileName(file: File): string {
  return (file.name.trim() || "attachment").slice(0, 240);
}

function safeRuntimeMimeType(file: File): string {
  return (file.type.trim().toLowerCase() || "application/octet-stream").slice(0, 120);
}

function safeRuntimeUploadMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/gi, "[redacted attachment url]")
    .replace(/\b(?:authorization|bearer|credential|credentials|secret|signature|token|storageKey|objectKey)\b\S*/gi, "[redacted]")
    .slice(0, 500);
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
