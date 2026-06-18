import {
  type AttachmentBlockType,
  currentEditorSchemaVersion,
  editorBlockTypes,
  type EditorBlock,
  type EditorBlockType,
  type EditorSnapshot
} from "@jixia/shared";
import { useState } from "react";

import { AttachmentBlock } from "../../attachments/AttachmentBlock";
import { Button } from "../../layout/workbench";

type JixiaEditorProps = {
  readonly documentId: string;
  readonly value: EditorSnapshot;
  readonly onChange: (nextSnapshot: EditorSnapshot) => void;
  readonly readOnly?: boolean;
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
  orderedList: "Ordered list",
  todo: "Todo",
  quote: "Quote",
  callout: "Callout",
  codeBlock: "Code block",
  divider: "Divider",
  table: "Table",
  image: "Image placeholder",
  file: "File placeholder"
};

type AttachmentEditorBlock = EditorBlock & {
  readonly type: AttachmentBlockType;
};

export function JixiaEditor({ documentId, value, onChange, readOnly = false }: JixiaEditorProps) {
  const [insertType, setInsertType] = useState<EditorBlockType>("paragraph");

  function commitBlocks(blocks: readonly EditorBlock[]): void {
    onChange({
      editorSchemaVersion: currentEditorSchemaVersion,
      blocks: blocks.length > 0 ? blocks : [createBlock("paragraph", 1)]
    });
  }

  function updateBlock(index: number, nextBlock: EditorBlock): void {
    commitBlocks(value.blocks.map((block, blockIndex) => (blockIndex === index ? nextBlock : block)));
  }

  function addBlock(type: EditorBlockType): void {
    commitBlocks([...value.blocks, createBlock(type, value.blocks.length + 1)]);
  }

  function removeBlock(index: number): void {
    commitBlocks(value.blocks.filter((_block, blockIndex) => blockIndex !== index));
  }

  return (
    <section aria-label="Jixia document editor" className="jixia-writing-canvas">
      <div className="jixia-writing-canvas__chrome">
        <span>
          Writing canvas · {value.blocks.length} {value.blocks.length === 1 ? "block" : "blocks"}
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
          <Button disabled={readOnly} onClick={() => addBlock(insertType)}>
            Insert block
          </Button>
        </div>
      </div>

      <div className="jixia-editor-block-stack">
        {value.blocks.map((block, index) => (
          <article className="jixia-editor-block" key={block.id}>
            <div className="jixia-editor-block__handle" aria-hidden="true">
              <span>{index + 1}</span>
            </div>

            <div className="jixia-editor-block__body">
              <div className="jixia-editor-block__toolbar" aria-label={`Block ${index + 1} controls`}>
                <span className="jixia-editor-block__type-label">{blockLabels[block.type]}</span>
                <label className="jixia-editor-block__type-select">
                  <span>Type</span>
                  <select
                    aria-label={`Block ${index + 1} type`}
                    disabled={readOnly}
                    onChange={(event) => updateBlock(index, changeBlockType(block, event.currentTarget.value))}
                    value={block.type}
                  >
                    {editorBlockTypes.map((type) => (
                      <option key={type} value={type}>
                        {blockLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  disabled={readOnly || value.blocks.length <= 1}
                  onClick={() => removeBlock(index)}
                  variant="ghost"
                >
                  Remove
                </Button>
              </div>

              <BlockEditor
                block={block}
                documentId={documentId}
                index={index}
                onChange={(nextBlock) => updateBlock(index, nextBlock)}
                readOnly={readOnly}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type BlockEditorProps = {
  readonly block: EditorBlock;
  readonly documentId: string;
  readonly index: number;
  readonly onChange: (nextBlock: EditorBlock) => void;
  readonly readOnly: boolean;
};

function BlockEditor({ block, documentId, index, onChange, readOnly }: BlockEditorProps) {
  if (block.type === "divider") {
    return <hr style={dividerStyle} aria-label={`Block ${index + 1} divider`} />;
  }

  if (isAttachmentEditorBlock(block)) {
    return (
      <AttachmentBlock block={block} documentId={documentId} index={index} onChange={onChange} readOnly={readOnly} />
    );
  }

  return (
    <div className="jixia-editor-block__content">
      {block.type === "heading" ? (
        <label className="jixia-editor-inline-control">
          <span>Heading level</span>
          <select
            aria-label={`Block ${index + 1} heading level`}
            disabled={readOnly}
            onChange={(event) => onChange(withAttributes(block, { level: Number(event.currentTarget.value) }))}
            value={headingLevel(block)}
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        </label>
      ) : null}

      {block.type === "todo" ? (
        <label className="jixia-editor-inline-control jixia-editor-inline-control--checkbox">
          <input
            checked={Boolean(block.attrs?.checked)}
            disabled={readOnly}
            onChange={(event) => onChange(withAttributes(block, { checked: event.currentTarget.checked }))}
            type="checkbox"
          />
          <span>Done</span>
        </label>
      ) : null}

      <textarea
        aria-label={`Block ${index + 1} text`}
        className={`jixia-editor-textarea jixia-editor-textarea--${block.type}`}
        disabled={readOnly || !textBlockTypes.has(block.type)}
        onChange={(event) => onChange({ ...block, text: event.currentTarget.value })}
        placeholder={textPlaceholder(block.type)}
        rows={block.type === "codeBlock" || block.type === "table" ? 6 : block.type === "heading" ? 1 : 3}
        value={block.text ?? ""}
      />
    </div>
  );
}

function changeBlockType(block: EditorBlock, value: string): EditorBlock {
  const type = editorBlockTypes.find((candidate) => candidate === value) ?? "paragraph";
  const nextBlock = createBlock(type, 1);

  if (!textBlockTypes.has(type)) {
    return { ...nextBlock, id: block.id };
  }

  return {
    ...nextBlock,
    id: block.id,
    text: block.text ?? nextBlock.text ?? ""
  };
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
      return { id, type, text: "| Column | Value |\n| --- | --- |" };
    case "image":
    case "file":
      return { id, type };
    default:
      return { id, type, text: "" };
  }
}

function withAttributes(block: EditorBlock, attrs: Record<string, unknown>): EditorBlock {
  return { ...block, attrs: { ...block.attrs, ...attrs } };
}

function isAttachmentEditorBlock(block: EditorBlock): block is AttachmentEditorBlock {
  return block.type === "image" || block.type === "file";
}

function headingLevel(block: EditorBlock): number {
  const level = block.attrs?.level;
  return typeof level === "number" && [1, 2, 3].includes(level) ? level : 2;
}

function textPlaceholder(type: EditorBlockType): string {
  if (type === "table") {
    return "Use a compact Markdown-style table until the richer table UI lands.";
  }

  if (type === "codeBlock") {
    return "Paste code or protocol snippets here.";
  }

  return "Write research notes here.";
}

const dividerStyle = {
  border: 0,
  borderTop: "1px solid #dbe5ed",
  margin: "18px 0"
};
