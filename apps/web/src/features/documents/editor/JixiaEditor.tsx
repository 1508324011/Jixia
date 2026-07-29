import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import {
  BlockNoteSchema,
  createFileBlockConfig,
  createImageBlockConfig,
  defaultBlockSpecs,
  fileParse,
  imageParse,
  type BlockSpecs,
  type PartialBlock,
} from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import {
  FileBlockWrapper,
  ImageBlock,
  ImageToExternalHTML,
  createReactBlockSpec,
  useCreateBlockNote,
  useResolveUrl
} from "@blocknote/react";
import {
  type AttachmentBlockType,
  currentEditorSchemaVersion,
  type EditorBlock,
  type EditorBlockAttributes,
  type EditorBlockType,
  type EditorSnapshot
} from "@jixia/shared";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type MouseEvent,
  forwardRef,
  type ReactElement,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";

import { openAttachmentDownload, uploadAttachment, type UploadedAttachmentResult } from "../../attachments/uploadAttachment";
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

const jixiaCalloutBlock = createJixiaCalloutBlockSpec();

const jixiaNativeAttachmentPropSchema = {
  attachmentId: { default: "" },
  fileName: { default: "" },
  mimeType: { default: "" },
  sizeBytes: { default: 0 },
  checksum: { default: "" },
  uploadedAt: { default: "" },
  altText: { default: "" },
  description: { default: "" },
  previewWidth: { default: 420, type: "number" },
  showPreview: { default: true },
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
} as const;

const createLooseReactBlockSpec = createReactBlockSpec as unknown as (
  blockConfigOrCreator: unknown,
  blockImplementationOrCreator: unknown,
  extensionsOrCreator?: unknown
) => (options?: unknown) => unknown;

const createJixiaImageBlockConfig = (options: Parameters<typeof createImageBlockConfig>[0] = {}) => {
  const config = createImageBlockConfig(options);

  return {
    ...config,
    propSchema: {
      ...config.propSchema,
      ...jixiaNativeAttachmentPropSchema
    }
  };
};

const createJixiaFileBlockConfig = () => {
  const config = createFileBlockConfig();

  return {
    ...config,
    propSchema: {
      ...config.propSchema,
      ...jixiaNativeAttachmentPropSchema
    }
  };
};

type JixiaImageBlockRenderProps = Parameters<typeof ImageBlock>[0];

function JixiaResolvedImageBlock(props: JixiaImageBlockRenderProps) {
  const [attempt, setAttempt] = useState(0);

  return (
    <JixiaResolvedImageAttempt
      key={attempt}
      onRetry={() => setAttempt((currentAttempt) => currentAttempt + 1)}
      props={props}
    />
  );
}

function JixiaResolvedImageAttempt({
  onRetry,
  props
}: {
  readonly onRetry: () => void;
  readonly props: JixiaImageBlockRenderProps;
}) {
  const resolved = useResolveUrl(props.block.props.url || "");

  if (resolved.loadingState === "loading") {
    return (
      <div
        aria-label="Loading image preview"
        className="jixia-native-attachment-frame__image-state"
        role="status"
      >
        Resolving private image preview…
      </div>
    );
  }

  if (resolved.loadingState === "error" || resolved.downloadUrl === undefined) {
    return (
      <div
        aria-label="Image preview unavailable"
        className="jixia-native-attachment-frame__image-state"
        role="alert"
      >
        <strong>Image preview unavailable</strong>
        <span>The private image could not be resolved. Its attachment remains linked to this document.</span>
        <Button onClick={onRetry} variant="secondary">
          Retry image preview
        </Button>
      </div>
    );
  }

  const resolvedBlock = {
    ...props.block,
    props: {
      ...props.block.props,
      url: resolved.downloadUrl
    }
  };

  return <ImageBlock {...props} block={resolvedBlock} />;
}

const jixiaNativeImageBlock = createLooseReactBlockSpec(
  createJixiaImageBlockConfig,
  (options: Parameters<typeof createImageBlockConfig>[0]) => ({
    meta: {
      fileBlockAccept: ["image/*"]
    },
    render: (props: Parameters<typeof ImageBlock>[0]) => (
      <JixiaNativeAttachmentFrame blockType="image" block={props.block} editor={props.editor as unknown as JixiaBlockNoteEditor}>
        <JixiaResolvedImageBlock {...props} />
      </JixiaNativeAttachmentFrame>
    ),
    parse: imageParse(options) as unknown,
    toExternalHTML: (props: Parameters<typeof ImageToExternalHTML>[0]) => <ImageToExternalHTML {...props} />,
    runsBefore: ["file"]
  })
);

const jixiaNativeFileBlock = createLooseReactBlockSpec(createJixiaFileBlockConfig, {
  render: (props: Parameters<typeof FileBlockWrapper>[0]) => (
    <JixiaNativeAttachmentFrame blockType="file" block={props.block} editor={props.editor as unknown as JixiaBlockNoteEditor}>
      <FileBlockWrapper {...props} />
    </JixiaNativeAttachmentFrame>
  ),
  parse: fileParse() as unknown,
  toExternalHTML: (props: Parameters<typeof FileBlockWrapper>[0]) => {
    if (!props.block.props.url) {
      return <p>Add file</p>;
    }

    return <a href={props.block.props.url}>{props.block.props.name || props.block.props.url}</a>;
  }
});

const jixiaBlockSpecs = {
  ...defaultBlockSpecs,
  image: jixiaNativeImageBlock(),
  file: jixiaNativeFileBlock(),
  jixiaCallout: jixiaCalloutBlock()
};

const jixiaBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: jixiaBlockSpecs as unknown as BlockSpecs
});

type JixiaBlockNoteEditor = {
  documentId?: string;
  isEditable?: boolean;
  readonly document: readonly JixiaBlockNoteBlock[];
  readonly getTextCursorPosition?: () => { readonly block?: { readonly id: string } };
  readonly insertBlocks: (blocks: readonly PartialBlock[], referenceBlock: { readonly id: string }, placement: "after" | "before") => void;
  readonly removeBlocks: (blocks: readonly string[]) => void;
  readonly replaceBlocks: (blocksToRemove: readonly { readonly id: string }[], blocksToInsert: readonly PartialBlock[]) => void;
  readonly updateBlock: (block: string, update: PartialBlock | { readonly props?: Record<string, boolean | number | string> }) => void;
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

type JixiaUploadFileResult = {
  readonly props: Record<string, boolean | number | string>;
};

type AttachmentUploadStatus = "uploading" | "success" | "error";

type FileInsertionReference = {
  readonly block: { readonly id: string; readonly type?: string; readonly content?: unknown };
  readonly placement: "after" | "before";
};

type JixiaBlockNoteViewProps = {
  readonly "data-testid": string;
  readonly emojiPicker: false;
  readonly editable: boolean;
  readonly editor: JixiaBlockNoteEditor;
  readonly filePanel: boolean;
  readonly formattingToolbar: boolean;
  readonly linkToolbar: false;
  readonly onChange: () => void;
  readonly sideMenu: boolean;
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

const jixiaAttachmentUrlPrefix = "jixia-attachment:";
const nativeFileBlockTypes = new Set<string>(["image", "file", "video", "audio"]);

export const JixiaEditor = forwardRef<JixiaEditorHandle, JixiaEditorProps>(function JixiaEditor(
  { documentId, documentVersionKey = documentId, value, onChange, readOnly = false },
  ref
) {
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const [shellDragState, setShellDragState] = useState<"idle" | "ready">("idle");
  const lastSnapshotRef = useRef<EditorSnapshot>(ensureSnapshotHasBlocks(value));
  const skipNextChangeRef = useRef(false);
  const initialDocumentVersionKeyRef = useRef(documentVersionKey);
  const initialContentRef = useRef(snapshotToBlockNoteBlocks(value));
  const editorRef = useRef<JixiaBlockNoteEditor | null>(null);

  if (initialDocumentVersionKeyRef.current !== documentVersionKey) {
    initialDocumentVersionKeyRef.current = documentVersionKey;
    initialContentRef.current = snapshotToBlockNoteBlocks(value);
    lastSnapshotRef.current = ensureSnapshotHasBlocks(value);
  }

  const blockNoteEditor = useCreateBlockNote(
    {
      schema: jixiaBlockNoteSchema,
      initialContent: initialContentRef.current as unknown as PartialBlock[],
      defaultStyles: true,
      setIdAttribute: true,
      tabBehavior: "prefer-indent",
      uploadFile: (file: File, blockId?: string) => uploadFileForEditor({
        documentId,
        editor: editorRef.current,
        readOnly,
        file,
        ...(blockId ? { blockId } : {})
      }),
      resolveFileUrl: resolveJixiaAttachmentUrl,
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
  editorRef.current = editor;
  const isEmptyDocument = isEmptyEditorSnapshot(lastSnapshotRef.current);

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

  function handleNativeAttachmentClick(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target;
    if (!(target instanceof Element) || isInteractiveElement(target)) {
      return;
    }

    const blockElement = target.closest<HTMLElement>("[data-id]");
    const blockId = blockElement?.dataset.id;
    const block = blockId ? editor.document.find((candidate) => candidate.id === blockId) : undefined;
    const props = (block as unknown as JixiaBlockNotePartialBlock | undefined)?.props ?? {};
    const attachmentId = attachmentIdFromBlockProps(props);
    if (!attachmentId || !nativeFileBlockTypes.has((block as unknown as JixiaBlockNotePartialBlock | undefined)?.type ?? "")) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setAttachmentMessage("Resolving private attachment download…");
    void openAttachmentDownload({ attachmentId })
      .then(() => setAttachmentMessage(null))
      .catch((error: unknown) => {
        setAttachmentMessage(error instanceof Error ? error.message : "Unable to open attachment.");
      });
  }

  function handleEditorPaste(event: ClipboardEvent<HTMLDivElement>): void {
    if (readOnly || event.defaultPrevented) {
      return;
    }

    const files = attachmentFilesFromClipboardData(event.clipboardData);
    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    insertFilesWithUploadPlaceholders(files, referenceFromCurrentCursor(editor));
  }

  function handleEditorDragOver(event: DragEvent<HTMLDivElement>): void {
    if (readOnly || !dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setShellDragState("ready");
  }

  function handleEditorDragLeave(event: DragEvent<HTMLDivElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setShellDragState("idle");
    }
  }

  function handleEditorDrop(event: DragEvent<HTMLDivElement>): void {
    if (readOnly || event.defaultPrevented) {
      return;
    }

    const files = attachmentFilesFromDataTransfer(event.dataTransfer);
    if (files.length === 0) {
      setShellDragState("idle");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setShellDragState("idle");
    insertFilesWithUploadPlaceholders(files, referenceFromDropEvent(editor, event));
  }

  function insertFilesWithUploadPlaceholders(
    files: readonly File[],
    initialReference: FileInsertionReference | undefined
  ): void {
    if (files.length === 0) {
      return;
    }

    let reference = initialReference ?? referenceFromCurrentCursor(editor);
    const insertedBlocks: JixiaBlockNotePartialBlock[] = [];

    try {
      for (const file of files) {
        const block = uploadingNativeAttachmentBlock(file);
        const currentBlocks = editor.document;
        const effectiveReference = reference ?? referenceFromLastBlock(editor);

        if (!effectiveReference) {
          editor.replaceBlocks(currentBlocks, [block as unknown as PartialBlock]);
        } else if (shouldReplaceInitialEmptyParagraph(currentBlocks, effectiveReference.block, insertedBlocks.length)) {
          editor.replaceBlocks([effectiveReference.block], [block as unknown as PartialBlock]);
        } else {
          editor.insertBlocks([block as unknown as PartialBlock], effectiveReference.block, effectiveReference.placement);
        }

        insertedBlocks.push(block);
        reference = referenceFromInsertedBlock(editor, block) ?? reference;
        void uploadPlaceholderAttachment(editor, documentId, block, file);
      }

      setAttachmentMessage(
        files.length === 1
          ? `Uploading ${displayFileName(files[0] ?? new File([], "attachment"))} through Jixia private storage…`
          : `Uploading ${files.length} files through Jixia private storage…`
      );
    } catch (error: unknown) {
      setAttachmentMessage(error instanceof Error ? error.message : "Unable to insert attachment upload placeholder.");
    }
  }

  return (
    <section aria-label="Jixia document editor" className="jixia-writing-canvas" data-empty={isEmptyDocument ? "true" : "false"}>
      <div
        className="jixia-blocknote-shell"
        data-drag-state={shellDragState}
        data-empty={isEmptyDocument ? "true" : "false"}
        data-readonly={readOnly ? "true" : "false"}
        onClick={handleNativeAttachmentClick}
        onDragLeave={handleEditorDragLeave}
        onDragOver={handleEditorDragOver}
        onDrop={handleEditorDrop}
        onPaste={handleEditorPaste}
      >
        {!readOnly && isEmptyDocument ? (
          <p className="jixia-blocknote-shell__empty-affordance">
            Start writing. Type / for blocks, or paste and drop files when needed.
          </p>
        ) : null}
        {shellDragState === "ready" ? (
          <p className="jixia-blocknote-shell__drop-hint" role="status">
            Drop to insert a private attachment at this location.
          </p>
        ) : null}
        {attachmentMessage ? (
          <p className="jixia-blocknote-shell__status" role="status">
            {attachmentMessage}
          </p>
        ) : null}
        <JixiaBlockNoteView
          data-testid="jixia-blocknote-view"
          emojiPicker={false}
          editable={!readOnly}
          editor={editor}
          filePanel={!readOnly}
          formattingToolbar={!readOnly}
          linkToolbar={false}
          onChange={commitRuntimeSnapshot}
          sideMenu={!readOnly}
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

async function uploadFileForEditor(input: {
  readonly documentId: string;
  readonly editor: JixiaBlockNoteEditor | null;
  readonly readOnly: boolean;
  readonly file: File;
  readonly blockId?: string;
}): Promise<JixiaUploadFileResult> {
  if (input.readOnly) {
    throw new Error("Read-only documents cannot upload attachments.");
  }

  if (input.blockId && input.editor) {
    markBlockUploadState(input.editor, input.blockId, uploadingAttachmentProps(input.file));
  }

  try {
    const blockType = input.blockId && input.editor
      ? uploadBlockTypeForNativeBlock(input.editor, input.blockId, input.file)
      : attachmentBlockTypeForFile(input.file);
    const uploadedAttachment = await uploadAttachment({
      documentId: input.documentId,
      blockType,
      file: input.file
    });
    const props = uploadedAttachmentProps(uploadedAttachment, input.file);

    if (input.blockId && input.editor) {
      markBlockUploadState(input.editor, input.blockId, props);
    }

    return { props };
  } catch (error: unknown) {
    if (input.blockId && input.editor) {
      markBlockUploadState(input.editor, input.blockId, failedAttachmentProps(input.file, error));
    }
    throw error;
  }
}

async function resolveJixiaAttachmentUrl(url: string): Promise<string> {
  const attachmentId = attachmentIdFromUrl(url);
  if (!attachmentId) {
    return url;
  }

  let resolvedUrl = "";
  await openAttachmentDownload({
    attachmentId,
    opener: (downloadUrl) => {
      resolvedUrl = downloadUrl;
    }
  });

  if (!resolvedUrl) {
    throw new Error("Attachment download URL resolver returned no URL.");
  }

  return resolvedUrl;
}

function uploadingNativeAttachmentBlock(file: File): JixiaBlockNotePartialBlock {
  const type = attachmentBlockTypeForFile(file);

  return {
    id: generatedBlockId(type),
    type,
    props: uploadingAttachmentProps(file),
    children: []
  };
}

function uploadingAttachmentProps(file: File): Record<string, boolean | number | string> {
  return {
    attachmentId: "",
    url: "",
    name: displayFileName(file),
    fileName: displayFileName(file),
    mimeType: displayMimeType(file),
    sizeBytes: file.size,
    checksum: "",
    uploadedAt: "",
    uploadStatus: "uploading",
    uploadMessage: "Uploading through server-issued private attachment intent…",
    pendingFileName: displayFileName(file),
    pendingMimeType: displayMimeType(file),
    pendingSizeBytes: file.size
  };
}

function failedAttachmentProps(file: File, error: unknown): Record<string, boolean | number | string> {
  return {
    ...uploadingAttachmentProps(file),
    uploadStatus: "error",
    uploadMessage: safeAttachmentUploadMessage(error),
    attachmentId: "",
    url: "",
    uploadedAt: ""
  };
}

function markBlockUploadState(
  editor: JixiaBlockNoteEditor,
  blockId: string,
  props: Record<string, boolean | number | string>
): void {
  const block = editor.document.find((candidate) => candidate.id === blockId);

  if (!block || !nativeFileBlockTypes.has(block.type)) {
    return;
  }

  const type = block.type === "image" ? "image" : "file";

  editor.updateBlock(blockId, {
    props: {
      ...props,
      ...authoredAttachmentDisplayProps(block.props, type)
    }
  });
}

function authoredAttachmentDisplayProps(
  props: Record<string, unknown>,
  type: AttachmentBlockType
): Record<string, boolean | number | string> {
  const attrs = attachmentDisplayMetadataAttrs(props, type);
  const nextProps: Record<string, boolean | number | string> = {};

  if (typeof attrs.caption === "string") {
    nextProps.caption = attrs.caption;
    nextProps.hasCaption = true;
  }
  if (type === "image" && typeof attrs.altText === "string") {
    nextProps.altText = attrs.altText;
    nextProps.hasAltText = true;
  }
  if (typeof attrs.description === "string") {
    nextProps.description = attrs.description;
    nextProps.hasDescription = true;
  }
  if (typeof attrs.previewWidth === "number") {
    nextProps.previewWidth = attrs.previewWidth;
    nextProps.hasPreviewWidth = true;
  }
  if (typeof attrs.showPreview === "boolean") {
    nextProps.showPreview = attrs.showPreview;
    nextProps.hasShowPreview = true;
  }

  return nextProps;
}

async function uploadPlaceholderAttachment(
  editor: JixiaBlockNoteEditor,
  documentId: string,
  block: JixiaBlockNotePartialBlock,
  file: File
): Promise<void> {
  const blockId = block.id;
  if (!blockId) {
    return;
  }

  try {
    const blockType = uploadBlockTypeForPlaceholder(block, file);
    const uploadedAttachment = await uploadAttachment({
      documentId,
      blockType,
      file
    });

    markBlockUploadState(editor, blockId, uploadedAttachmentProps(uploadedAttachment, file));
  } catch (error: unknown) {
    markBlockUploadState(editor, blockId, failedAttachmentProps(file, error));
  }
}

async function uploadNativeAttachmentIntoBlock(input: {
  readonly editor: JixiaBlockNoteEditor;
  readonly documentId: string;
  readonly blockId: string;
  readonly blockType: AttachmentBlockType;
  readonly file: File;
}): Promise<void> {
  markBlockUploadState(input.editor, input.blockId, uploadingAttachmentProps(input.file));

  try {
    const uploadedAttachment = await uploadAttachment({
      documentId: input.documentId,
      blockType: input.blockType,
      file: input.file
    });

    markBlockUploadState(input.editor, input.blockId, uploadedAttachmentProps(uploadedAttachment, input.file));
  } catch (error: unknown) {
    markBlockUploadState(input.editor, input.blockId, failedAttachmentProps(input.file, error));
  }
}

function uploadBlockTypeForNativeBlock(
  editor: JixiaBlockNoteEditor,
  blockId: string,
  file: File
): AttachmentBlockType {
  const blockType = editor.document.find((candidate) => candidate.id === blockId)?.type;
  return blockType === "image" || blockType === "file" ? blockType : attachmentBlockTypeForFile(file);
}

function uploadBlockTypeForPlaceholder(block: JixiaBlockNotePartialBlock, file: File): AttachmentBlockType {
  return block.type === "image" || block.type === "file" ? block.type : attachmentBlockTypeForFile(file);
}

function referenceFromCurrentCursor(editor: JixiaBlockNoteEditor): FileInsertionReference | undefined {
  const cursorBlock = editor.getTextCursorPosition?.().block;
  if (cursorBlock?.id) {
    const block = editor.document.find((candidate) => candidate.id === cursorBlock.id) ?? cursorBlock;
    return { block, placement: isEmptyParagraphBlock(block) ? "before" : "after" };
  }

  return referenceFromLastBlock(editor);
}

function referenceFromInsertedBlock(
  editor: JixiaBlockNoteEditor,
  block: JixiaBlockNotePartialBlock
): FileInsertionReference | undefined {
  if (!block.id) {
    return undefined;
  }

  const insertedBlock = editor.document.find((candidate) => candidate.id === block.id);
  return insertedBlock ? { block: insertedBlock, placement: "after" } : undefined;
}

function referenceFromDropEvent(
  editor: JixiaBlockNoteEditor,
  event: DragEvent<HTMLDivElement>
): FileInsertionReference | undefined {
  const targetReference = referenceFromEventTarget(editor, event.target);
  if (targetReference) {
    return targetReference;
  }

  return referenceFromPoint(editor, event.clientY) ?? referenceFromCurrentCursor(editor);
}

function referenceFromEventTarget(
  editor: JixiaBlockNoteEditor,
  target: EventTarget | null
): FileInsertionReference | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const blockElement = target.closest<HTMLElement>("[data-id]");
  const blockId = blockElement?.dataset.id;
  const block = blockId ? editor.document.find((candidate) => candidate.id === blockId) : undefined;

  return block ? { block, placement: isEmptyParagraphBlock(block) ? "before" : "after" } : undefined;
}

function referenceFromPoint(editor: JixiaBlockNoteEditor, clientY: number): FileInsertionReference | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const blockElements = Array.from(document.querySelectorAll<HTMLElement>(".jixia-blocknote-shell [data-id]"));
  for (const blockElement of blockElements) {
    const blockId = blockElement.dataset.id;
    const block = blockId ? editor.document.find((candidate) => candidate.id === blockId) : undefined;
    if (!block) {
      continue;
    }

    const box = blockElement.getBoundingClientRect();
    if (clientY >= box.top && clientY <= box.bottom) {
      return { block, placement: clientY < box.top + box.height / 2 ? "before" : "after" };
    }
  }

  return undefined;
}

function referenceFromLastBlock(editor: JixiaBlockNoteEditor): FileInsertionReference | undefined {
  const lastBlock = editor.document[editor.document.length - 1];
  return lastBlock ? { block: lastBlock, placement: isEmptyParagraphBlock(lastBlock) ? "before" : "after" } : undefined;
}

function shouldReplaceInitialEmptyParagraph(
  blocks: readonly JixiaBlockNoteBlock[],
  referenceBlock: { readonly id: string; readonly type?: string; readonly content?: unknown },
  insertedIndex: number
): boolean {
  return insertedIndex === 0 && blocks.length === 1 && blocks[0]?.id === referenceBlock.id && isEmptyParagraphBlock(referenceBlock);
}

function isEmptyParagraphBlock(block: { readonly id: string; readonly type?: string; readonly content?: unknown }): boolean {
  return (block.type ?? "paragraph") === "paragraph" && blockContentText(block.content).trim().length === 0;
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
      return attachmentBlockToBlockNoteBlock(block, "image");
    case "file":
      return attachmentBlockToBlockNoteBlock(block, "file");
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
      return [compactBlock({ id: blockId, type: "codeBlock", attrs: codeBlockAttrs(blockProps), text: inlineText(block.content), content })];
    case "divider":
      return [compactBlock({ id: blockId, type: "divider", content })];
    case "table":
      return [compactBlock({ id: blockId, type: "table", text: tableContentToMarkdown(block.content), content })];
    case "image":
    case "video":
    case "audio":
    case "file":
      return [blockNoteAttachmentBlockToEditorBlock(block, blockType === "image" ? "image" : "file")];
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

function attachmentBlockToBlockNoteBlock(block: EditorBlock, type: "image" | "file" | "jixiaImage" | "jixiaFile"): JixiaBlockNotePartialBlock {
  const metadata = readAttachmentMetadata(block.attrs?.attachment);
  const blockType = type === "image" || type === "jixiaImage" ? "image" : "file";
  const attachmentId = block.attachmentId ?? "";

  return {
    id: block.id,
    type,
    props: {
      attachmentId,
      url: attachmentId ? attachmentUrl(attachmentId) : "",
      name: metadata?.fileName ?? "",
      fileName: metadata?.fileName ?? "",
      mimeType: metadata?.mimeType ?? "",
      sizeBytes: metadata?.sizeBytes ?? 0,
      checksum: metadata?.checksum ?? "",
      uploadedAt: metadata?.uploadedAt ?? "",
      ...attachmentDisplayMetadataProps(block.attrs, blockType)
    },
    children: block.content?.map(editorBlockToBlockNoteBlock) ?? []
  };
}

function blockNoteAttachmentBlockToEditorBlock(
  block: JixiaBlockNotePartialBlock,
  type: AttachmentBlockType
): EditorBlock {
  const blockProps = block.props ?? {};
  const attachmentId = attachmentIdFromBlockProps(blockProps);
  const fileName = readStringProp(blockProps, "fileName") || readStringProp(blockProps, "name");
  const mimeType = readStringProp(blockProps, "mimeType");
  const sizeBytes = readNumberProp(blockProps, "sizeBytes");
  const uploadedAt = readStringProp(blockProps, "uploadedAt");
  const checksum = readStringProp(blockProps, "checksum");
  const attachmentMetadata = attachmentId && fileName && mimeType && sizeBytes !== undefined && uploadedAt
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

function JixiaNativeAttachmentFrame({
  blockType,
  block,
  editor,
  children
}: {
  readonly blockType: AttachmentBlockType;
  readonly block: { readonly id: string; readonly props: Record<string, unknown> };
  readonly editor: JixiaBlockNoteEditor;
  readonly children: ReactElement;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [frameMessage, setFrameMessage] = useState<string | null>(null);
  const [dragState, setDragState] = useState<"idle" | "ready">("idle");
  const props = block.props;
  const attachmentId = attachmentIdFromBlockProps(props);
  const uploadStatus = readAttachmentUploadStatus(props.uploadStatus);
  const fileName = readStringProp(props, "pendingFileName") || readStringProp(props, "fileName") || readStringProp(props, "name");
  const mimeType = readStringProp(props, "pendingMimeType") || readStringProp(props, "mimeType");
  const pendingSizeBytes = readNumberProp(props, "pendingSizeBytes");
  const storedSizeBytes = readNumberProp(props, "sizeBytes");
  const sizeBytes = uploadStatus === "uploading" || uploadStatus === "error"
    ? pendingSizeBytes ?? storedSizeBytes
    : storedSizeBytes;
  const isEditable = editor.isEditable !== false;
  const hasAttachment = Boolean(attachmentId);
  const statusLabel = uploadStatus === "error"
    ? "Upload failed"
    : uploadStatus === "uploading"
      ? "Uploading…"
      : hasAttachment
        ? "Private attachment linked"
        : `Add ${blockType}`;
  const frameStatus = uploadStatus ?? (hasAttachment ? "success" : "idle");
  const isReadyAttachment = hasAttachment && frameStatus === "success";
  const fileSizeLabel = sizeBytes !== undefined ? formatBytes(sizeBytes) : undefined;
  const detail = readStringProp(props, "uploadMessage") || frameMessage || (
    hasAttachment
      ? "Preview and open use server-authorized signed access at render time."
      : `Drop or paste a ${blockType} here, or choose a private file from your computer.`
  );
  const inputLabel = `Upload private ${blockType} attachment`;
  const actionLabel = uploadStatus === "uploading"
    ? "Uploading…"
    : uploadStatus === "error"
      ? "Retry upload"
      : hasAttachment
        ? `Replace ${blockType}`
        : `Upload private ${blockType}`;

  async function handleRetryInput(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.item?.(0) ?? event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file || !isEditable) {
      return;
    }

    await uploadFileIntoFrame(file);
  }

  async function uploadFileIntoFrame(file: File): Promise<void> {
    if (!isEditable || uploadStatus === "uploading") {
      return;
    }

    if (blockType === "image" && !file.type.toLowerCase().startsWith("image/")) {
      markBlockUploadState(editor, block.id, failedAttachmentProps(file, new Error("Image blocks only accept image files.")));
      return;
    }

    setFrameMessage(`Uploading ${displayFileName(file)} through Jixia private storage…`);
    await uploadNativeAttachmentIntoBlock({
      editor,
      documentId: editor.documentId ?? "",
      blockId: block.id,
      blockType,
      file
    });
    setFrameMessage(null);
  }

  function handleFramePaste(event: ClipboardEvent<HTMLElement>): void {
    if (!isEditable || event.defaultPrevented || uploadStatus === "uploading") {
      return;
    }

    const file = attachmentFilesFromClipboardData(event.clipboardData)[0];
    if (!file) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void uploadFileIntoFrame(file);
  }

  function handleFrameDragOver(event: DragEvent<HTMLElement>): void {
    if (!isEditable || uploadStatus === "uploading" || !dataTransferHasFiles(event.dataTransfer)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDragState("ready");
  }

  function handleFrameDragLeave(event: DragEvent<HTMLElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDragState("idle");
    }
  }

  function handleFrameDrop(event: DragEvent<HTMLElement>): void {
    if (!isEditable || event.defaultPrevented || uploadStatus === "uploading") {
      return;
    }

    const file = attachmentFilesFromDataTransfer(event.dataTransfer)[0];
    if (!file) {
      setDragState("idle");
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setDragState("idle");
    void uploadFileIntoFrame(file);
  }

  function openFilePicker(): void {
    if (isEditable && uploadStatus !== "uploading") {
      fileInputRef.current?.click();
    }
  }

  function removeBlock(): void {
    if (isEditable) {
      editor.removeBlocks([block.id]);
    }
  }

  function openAttachment(): void {
    if (!attachmentId) {
      openFilePicker();
      return;
    }

    setFrameMessage("Resolving private attachment download…");
    void openAttachmentDownload({ attachmentId })
      .then(() => setFrameMessage(null))
      .catch((error: unknown) => setFrameMessage(safeAttachmentUploadMessage(error)));
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      accept={blockType === "image" ? "image/*" : undefined}
      aria-label={inputLabel}
      disabled={!isEditable || uploadStatus === "uploading"}
      onChange={handleRetryInput}
      style={{ display: "none" }}
      type="file"
    />
  );

  if (isReadyAttachment && blockType === "image") {
    return (
      <section
        aria-label="Private image attachment"
        className="jixia-native-attachment-frame jixia-native-attachment-frame--ready jixia-native-attachment-frame--ready-image"
        contentEditable={false}
        data-drag-state={dragState}
        data-has-attachment="true"
        data-status="success"
        data-testid="jixia-native-image-attachment-frame"
        onDragLeave={handleFrameDragLeave}
        onDragOver={handleFrameDragOver}
        onDrop={handleFrameDrop}
        onPaste={handleFramePaste}
      >
        <figure className="jixia-native-attachment-frame__image-content">
          {children}
        </figure>
      </section>
    );
  }

  if (isReadyAttachment) {
    return (
      <section
        aria-label="Private file attachment"
        className="jixia-native-attachment-frame jixia-native-attachment-frame--ready jixia-native-attachment-frame--ready-file"
        contentEditable={false}
        data-drag-state={dragState}
        data-has-attachment="true"
        data-status="success"
        data-testid="jixia-native-file-attachment-frame"
        onDragLeave={handleFrameDragLeave}
        onDragOver={handleFrameDragOver}
        onDrop={handleFrameDrop}
        onPaste={handleFramePaste}
      >
        <button
          aria-label={fileName ? `Private file attachment ${fileName}` : "Private file attachment"}
          className="jixia-native-attachment-frame__file-chip"
          onClick={openAttachment}
          type="button"
        >
          <span className="jixia-native-attachment-frame__file-icon" aria-hidden="true">
            {mimeType?.includes("pdf") ? "PDF" : "FILE"}
          </span>
          <span className="jixia-native-attachment-frame__file-main">
            <strong>{fileName || "Private file"}</strong>
            <small>{[mimeType, fileSizeLabel].filter(Boolean).join(" · ") || "Server-authorized private file"}</small>
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={`Private ${blockType} attachment block`}
      className="jixia-native-attachment-frame"
      contentEditable={false}
      data-drag-state={dragState}
      data-has-attachment={hasAttachment ? "true" : "false"}
      data-status={frameStatus}
      data-testid={`jixia-native-${blockType}-attachment-frame`}
      onDragLeave={handleFrameDragLeave}
      onDragOver={handleFrameDragOver}
      onDrop={handleFrameDrop}
      onPaste={handleFramePaste}
    >
      <div className="jixia-native-attachment-frame__chrome">
        <div>
          <p className="jixia-eyebrow">Private {blockType} attachment</p>
          <strong>{statusLabel}</strong>
          {fileName ? <small className="jixia-native-attachment-frame__filename">{fileName}</small> : null}
        </div>
        <div className="jixia-native-attachment-frame__actions">
          {hasAttachment ? (
            <Button disabled={uploadStatus === "uploading"} onClick={openAttachment} variant="ghost">
              Open attachment
            </Button>
          ) : null}
          {isEditable ? (
            <Button disabled={uploadStatus === "uploading"} onClick={openFilePicker} variant={hasAttachment ? "secondary" : "primary"}>
              {actionLabel}
            </Button>
          ) : null}
          {isEditable && uploadStatus === "error" ? (
            <Button onClick={removeBlock} variant="danger">
              Remove failed block
            </Button>
          ) : null}
          {isEditable ? fileInput : null}
        </div>
      </div>
      {isEditable && uploadStatus !== "uploading" ? (
        <button
          aria-label={hasAttachment ? `Drop paste or replace ${blockType} attachment` : inputLabel}
          className="jixia-native-attachment-frame__dropzone"
          onClick={openFilePicker}
          type="button"
        >
          <strong>{hasAttachment ? `Drop or paste a replacement ${blockType}` : `Drop or paste a ${blockType}`}</strong>
          <span>{blockType === "image" ? "Images only" : "Any file type"} · upload stays private through the API.</span>
        </button>
      ) : null}
      {hasAttachment ? (
        <div className="jixia-native-attachment-frame__native">
          {children}
        </div>
      ) : null}
      {fileName || mimeType || sizeBytes !== undefined ? (
        <dl className="jixia-native-attachment-frame__metadata" aria-label={`${blockType} attachment metadata`}>
          {fileName ? (
            <div>
              <dt>Name</dt>
              <dd>{fileName}</dd>
            </div>
          ) : null}
          {mimeType ? (
            <div>
              <dt>Type</dt>
              <dd>{mimeType}</dd>
            </div>
          ) : null}
          {sizeBytes !== undefined ? (
            <div>
              <dt>Size</dt>
              <dd>{formatBytes(sizeBytes)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {detail ? (
        <p className="jixia-native-attachment-frame__message" role={uploadStatus === "error" ? "alert" : "status"}>
          {detail}
        </p>
      ) : null}
    </section>
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
      return { id, type, attrs: defaultAttachmentAttrs(type) };
    default:
      return { id, type, text: "" };
  }
}

function defaultAttachmentAttrs(type: AttachmentBlockType): EditorBlockAttributes {
  return {
    showPreview: type === "image"
  };
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

function isEmptyEditorSnapshot(snapshot: EditorSnapshot): boolean {
  const blocks = snapshot.blocks.length > 0 ? snapshot.blocks : [];
  return blocks.length === 0 || blocks.every(isEmptyEditorBlock);
}

function isEmptyEditorBlock(block: EditorBlock): boolean {
  if (block.attachmentId || block.type === "divider") {
    return false;
  }

  const hasText = typeof block.text === "string" && block.text.trim().length > 0;
  if (hasText) {
    return false;
  }

  return (block.content ?? []).every(isEmptyEditorBlock);
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

function codeBlockProps(block: EditorBlock): Record<string, boolean | number | string> {
  return {
    language: safeCodeLanguage(readStringAttr(block.attrs, "language"))
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

function readAttachmentUploadStatus(value: unknown): AttachmentUploadStatus | undefined {
  return value === "uploading" || value === "success" || value === "error" ? value : undefined;
}

function attachmentBlockTypeForFile(file: File): AttachmentBlockType {
  return file.type.toLowerCase().startsWith("image/") ? "image" : "file";
}

function uploadedAttachmentProps(
  uploadedAttachment: UploadedAttachmentResult,
  file: File
): Record<string, boolean | number | string> {
  return {
    attachmentId: uploadedAttachment.attachmentId,
    url: attachmentUrl(uploadedAttachment.attachmentId),
    name: uploadedAttachment.fileName,
    fileName: uploadedAttachment.fileName,
    mimeType: uploadedAttachment.mimeType,
    sizeBytes: uploadedAttachment.sizeBytes,
    checksum: uploadedAttachment.checksum ?? "",
    uploadedAt: uploadedAttachment.createdAt,
    caption: "",
    previewWidth: 420,
    showPreview: shouldShowNativePreview(file),
    uploadStatus: "success",
    uploadMessage: "Attachment uploaded and linked to this block.",
    pendingFileName: "",
    pendingMimeType: "",
    pendingSizeBytes: 0
  };
}

function shouldShowNativePreview(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  return mimeType.startsWith("image/") || mimeType.startsWith("audio/") || mimeType.startsWith("video/");
}

function attachmentFilesFromClipboardData(data: DataTransfer): readonly File[] {
  const files = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter(isNonNullAttachmentFile);

  return files.length > 0 ? files : attachmentFilesFromDataTransfer(data);
}

function attachmentFilesFromDataTransfer(data: DataTransfer): readonly File[] {
  return Array.from(data.files ?? []).filter(isAttachmentFile);
}

function dataTransferHasFiles(data: DataTransfer): boolean {
  return Array.from(data.types ?? []).includes("Files") || data.files.length > 0;
}

function isAttachmentFile(file: File): boolean {
  return file.size > 0 || displayFileName(file).length > 0;
}

function isNonNullAttachmentFile(file: File | null): file is File {
  return file !== null && isAttachmentFile(file);
}

function displayFileName(file: File): string {
  return file.name.trim() || "attachment";
}

function displayMimeType(file: File): string {
  return file.type.trim().toLowerCase() || "application/octet-stream";
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

function safeAttachmentUploadMessage(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : "Attachment upload failed.";

  return message
    .replace(/https?:\/\/\S+/gi, "[redacted attachment url]")
    .replace(/\b(?:authorization|bearer|credential|credentials|secret|signature|token|storageKey|objectKey)\b\S*/gi, "[redacted]")
    .slice(0, 700);
}

function attachmentUrl(attachmentId: string): string {
  return `${jixiaAttachmentUrlPrefix}${encodeURIComponent(attachmentId)}`;
}

function attachmentIdFromBlockProps(props: Record<string, unknown>): string | undefined {
  return readStringProp(props, "attachmentId") || attachmentIdFromUrl(readStringProp(props, "url") ?? "");
}

function attachmentIdFromUrl(url: string): string | undefined {
  if (!url.startsWith(jixiaAttachmentUrlPrefix)) {
    return undefined;
  }

  const encodedAttachmentId = url.slice(jixiaAttachmentUrlPrefix.length);
  try {
    const attachmentId = decodeURIComponent(encodedAttachmentId).trim();
    return attachmentId || undefined;
  } catch {
    return undefined;
  }
}

function isInteractiveElement(target: EventTarget): boolean {
  return target instanceof Element && Boolean(target.closest("button,input,select,textarea,label,a"));
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
