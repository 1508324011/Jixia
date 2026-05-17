import type { ChangeEvent } from "react";

import type {
  DocumentAiSuggestionBlock,
  DocumentBlock,
  DocumentBlockDocument,
  DocumentHeadingLevel,
  DocumentQuoteBlock,
} from "@shared/contracts/document-content";
import {
  DOCUMENT_BLOCK_SCHEMA_VERSION,
  normalizeDocumentBlockDocument,
} from "@shared/contracts/document-content";

import { createLegacyTextProjection } from "../lib/document-blocks";

type UserAuthoredBlockType = "heading" | "paragraph" | "quote" | "todo";

export interface DocumentBlockEditorProps {
  disabled?: boolean;
  label: string;
  onChange(nextDocument: DocumentBlockDocument): void;
  showProjection?: boolean;
  value: DocumentBlockDocument;
}

function toOptionalString(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

function createUserAuthoredBlock(type: UserAuthoredBlockType): DocumentBlock {
  switch (type) {
    case "heading":
      return {
        level: 2,
        text: "",
        type: "heading",
      };
    case "quote":
      return {
        text: "",
        type: "quote",
      };
    case "todo":
      return {
        checked: false,
        text: "",
        type: "todo",
      };
    case "paragraph":
      return {
        text: "",
        type: "paragraph",
      };
  }
}

function normalizeEditorDocument(blocks: DocumentBlock[]): DocumentBlockDocument {
  return normalizeDocumentBlockDocument({
    blocks,
    schemaVersion: DOCUMENT_BLOCK_SCHEMA_VERSION,
  });
}

function readHeadingLevel(event: ChangeEvent<HTMLSelectElement>): DocumentHeadingLevel {
  const level = Number(event.target.value);

  return level === 1 || level === 2 || level === 3 ? level : 2;
}

interface ReferenceMetadataBlock {
  libraryEntryId?: string;
  locator?: string;
  paperAssetId?: string;
}

function ReferenceMetadata({ block }: { block: ReferenceMetadataBlock }) {
  const metadata = [
    block.paperAssetId ? `Paper asset · ${block.paperAssetId}` : undefined,
    block.libraryEntryId ? `Library entry · ${block.libraryEntryId}` : undefined,
    block.locator ? `Locator · ${block.locator}` : undefined,
  ].filter((value): value is string => Boolean(value));

  if (metadata.length === 0) {
    return null;
  }

  return (
    <dl className="document-block-editor__metadata" aria-label="reference metadata">
      {metadata.map((item) => {
        const [term, detail] = item.split(" · ");

        return (
          <div key={item}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function AiSuggestionBlockView({ block }: { block: DocumentAiSuggestionBlock }) {
  return (
    <div className="document-block-editor__readonly-body">
      <p>{block.text}</p>
      {block.rationale ? (
        <p className="quiet-copy">Rationale · {block.rationale}</p>
      ) : null}
      <p className="quiet-copy">Status · {block.status}</p>
      <ReferenceMetadata block={block} />
    </div>
  );
}

function SourceAwareQuoteMetadata({ block }: { block: DocumentQuoteBlock }) {
  if (!block.evidenceSpan && !block.paperAssetId && !block.libraryEntryId) {
    return null;
  }

  return (
    <div className="document-block-editor__readonly-body">
      {block.evidenceSpan ? (
        <p className="quiet-copy">Evidence span · {block.evidenceSpan}</p>
      ) : null}
      <ReferenceMetadata block={block} />
    </div>
  );
}

export function DocumentBlockEditor({
  disabled = false,
  label,
  onChange,
  showProjection = true,
  value,
}: DocumentBlockEditorProps) {
  const blocks = value.blocks;
  const legacyProjection = createLegacyTextProjection(value);

  function commitBlocks(nextBlocks: DocumentBlock[]): void {
    onChange(normalizeEditorDocument(nextBlocks));
  }

  function updateBlock(index: number, block: DocumentBlock): void {
    commitBlocks(blocks.map((candidate, candidateIndex) => (
      candidateIndex === index ? block : candidate
    )));
  }

  function appendBlock(type: UserAuthoredBlockType): void {
    commitBlocks([...blocks, createUserAuthoredBlock(type)]);
  }

  return (
    <fieldset className="document-block-editor" disabled={disabled}>
      <legend className="document-block-editor__legend">{label}</legend>

      <div className="document-block-editor__toolbar" aria-label="add document block">
        <button type="button" onClick={() => appendBlock("paragraph")}>
          Add paragraph
        </button>
        <button type="button" onClick={() => appendBlock("heading")}>
          Add heading
        </button>
        <button type="button" onClick={() => appendBlock("quote")}>
          Add quote
        </button>
        <button type="button" onClick={() => appendBlock("todo")}>
          Add todo
        </button>
      </div>

      {blocks.length === 0 ? (
        <p className="quiet-copy">No document blocks yet. Add a paragraph to start writing.</p>
      ) : (
        <div className="document-block-editor__blocks">
          {blocks.map((block, index) => {
            const blockNumber = index + 1;
            const blockKey = block.id ?? `${block.type}-${index}`;

            return (
              <section
                className="document-block-editor__block"
                key={blockKey}
                aria-label={`${block.type} block ${blockNumber}`}
              >
                <header className="document-block-editor__block-header">
                  <span className="status-badge">{block.type}</span>
                  <span className="quiet-copy">Block {blockNumber}</span>
                </header>

                {block.type === "paragraph" ? (
                  <label className="document-block-editor__field">
                    <span>Paragraph block {blockNumber}</span>
                    <textarea
                      rows={4}
                      value={block.text}
                      onChange={(event) => updateBlock(index, {
                        ...block,
                        text: event.target.value,
                      })}
                    />
                  </label>
                ) : null}

                {block.type === "heading" ? (
                  <>
                    <label className="document-block-editor__field document-block-editor__field--compact">
                      <span>Heading block {blockNumber} level</span>
                      <select
                        value={block.level}
                        onChange={(event) => updateBlock(index, {
                          ...block,
                          level: readHeadingLevel(event),
                        })}
                      >
                        <option value={1}>Heading 1</option>
                        <option value={2}>Heading 2</option>
                        <option value={3}>Heading 3</option>
                      </select>
                    </label>
                    <label className="document-block-editor__field">
                      <span>Heading block {blockNumber} text</span>
                      <input
                        value={block.text}
                        onChange={(event) => updateBlock(index, {
                          ...block,
                          text: event.target.value,
                        })}
                      />
                    </label>
                  </>
                ) : null}

                {block.type === "quote" ? (
                  <>
                    <label className="document-block-editor__field">
                      <span>Quote block {blockNumber}</span>
                      <textarea
                        rows={4}
                        value={block.text}
                        onChange={(event) => updateBlock(index, {
                          ...block,
                          text: event.target.value,
                        })}
                      />
                    </label>
                    <label className="document-block-editor__field">
                      <span>Quote block {blockNumber} attribution</span>
                      <input
                        value={block.attribution ?? ""}
                        onChange={(event) => updateBlock(index, {
                          ...block,
                          attribution: toOptionalString(event.target.value),
                        })}
                      />
                    </label>
                    <SourceAwareQuoteMetadata block={block} />
                  </>
                ) : null}

                {block.type === "todo" ? (
                  <>
                    <label className="document-block-editor__checkbox">
                      <input
                        checked={block.checked}
                        type="checkbox"
                        onChange={(event) => updateBlock(index, {
                          ...block,
                          checked: event.target.checked,
                        })}
                      />
                      <span>Todo block {blockNumber} checked</span>
                    </label>
                    <label className="document-block-editor__field">
                      <span>Todo block {blockNumber} text</span>
                      <input
                        value={block.text}
                        onChange={(event) => updateBlock(index, {
                          ...block,
                          text: event.target.value,
                        })}
                      />
                    </label>
                  </>
                ) : null}

                {block.type === "citation" ? (
                  <div className="document-block-editor__readonly-body">
                    <p>
                      Citation · {block.label ?? block.paperAssetId}
                    </p>
                    {block.evidenceSpan ? (
                      <p className="quiet-copy">Evidence span · {block.evidenceSpan}</p>
                    ) : null}
                    <ReferenceMetadata block={block} />
                  </div>
                ) : null}

                {block.type === "sourceExcerpt" ? (
                  <div className="document-block-editor__readonly-body">
                    {block.title ? <p>{block.title}</p> : null}
                    <blockquote>{block.quote}</blockquote>
                    {block.note ? <p className="quiet-copy">Capture note · {block.note}</p> : null}
                    <ReferenceMetadata block={block} />
                  </div>
                ) : null}

                {block.type === "paperReference" ? (
                  <div className="document-block-editor__readonly-body">
                    <p>Paper reference · {block.title ?? block.paperAssetId}</p>
                    <ReferenceMetadata block={block} />
                  </div>
                ) : null}

                {block.type === "aiSuggestion" ? (
                  <AiSuggestionBlockView block={block} />
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {showProjection ? (
        <details className="document-block-editor__projection">
          <summary>Legacy text projection</summary>
          <pre>{legacyProjection}</pre>
        </details>
      ) : null}
    </fieldset>
  );
}
