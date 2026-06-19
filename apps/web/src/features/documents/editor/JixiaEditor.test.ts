import type { EditorSnapshot } from "@jixia/shared";
import { describe, expect, it } from "vitest";

import { blockNoteBlocksToSnapshot, snapshotToBlockNoteBlocks } from "./JixiaEditor";

describe("JixiaEditor adapter conversion", () => {
  it("round-trips supported v1 document blocks through BlockNote JSON", () => {
    const snapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [
        { id: "heading-1", type: "heading", attrs: { level: 2 }, text: "Research plan" },
        { id: "paragraph-1", type: "paragraph", text: "Initial finding" },
        { id: "bullet-1", type: "bulletList", text: "Collect papers" },
        { id: "ordered-1", type: "orderedList", text: "Analyze evidence" },
        { id: "todo-1", type: "todo", attrs: { checked: true }, text: "Verify citations" },
        { id: "quote-1", type: "quote", text: "Important participant quote" },
        { id: "callout-1", type: "callout", attrs: { tone: "warning" }, text: "Human review required" },
        { id: "code-1", type: "codeBlock", attrs: { language: "ts" }, text: "const checked = true;" },
        { id: "divider-1", type: "divider" },
        { id: "table-1", type: "table", text: "| Column | Value |\n| --- | --- |\n| Source | Paper |" },
        {
          id: "file-1",
          type: "file",
          attachmentId: "attachment-2",
          attrs: {
            attachment: {
              fileName: "protocol.pdf",
              mimeType: "application/pdf",
              sizeBytes: 256,
              checksum: null,
              uploadedAt: "2026-06-18T10:05:00.000Z"
            }
          }
        }
      ]
    };

    expect(blockNoteBlocksToSnapshot(snapshotToBlockNoteBlocks(snapshot))).toEqual(snapshot);
  });

  it("exports attachment blocks without signed URLs or storage keys", () => {
    const snapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [
        {
          id: "image-1",
          type: "image",
          attachmentId: "attachment-1",
          attrs: {
            attachment: {
              fileName: "figure.svg",
              mimeType: "image/svg+xml",
              sizeBytes: 128,
              checksum: "sha256:abc",
              uploadedAt: "2026-06-18T10:00:00.000Z",
              signedUrl: "https://example.test/private",
              storageKey: "tenant/private/object"
            }
          }
        }
      ]
    };

    const exported = blockNoteBlocksToSnapshot(snapshotToBlockNoteBlocks(snapshot));

    expect(exported).toEqual({
      editorSchemaVersion: 1,
      blocks: [
        {
          id: "image-1",
          type: "image",
          attachmentId: "attachment-1",
          attrs: {
            attachment: {
              fileName: "figure.svg",
              mimeType: "image/svg+xml",
              sizeBytes: 128,
              checksum: "sha256:abc",
              uploadedAt: "2026-06-18T10:00:00.000Z"
            }
          }
        }
      ]
    });
    expect(JSON.stringify(exported)).not.toMatch(/signedUrl|storageKey|private/);
  });

  it("normalizes empty and duplicate imported block ids without changing the v1 transport shape", () => {
    const snapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [
        { id: "", type: "paragraph", text: "Missing id" },
        { id: "duplicate", type: "paragraph", text: "First duplicate" },
        { id: "duplicate", type: "heading", attrs: { level: 3 }, text: "Second duplicate" }
      ]
    };

    expect(blockNoteBlocksToSnapshot(snapshotToBlockNoteBlocks(snapshot))).toEqual({
      editorSchemaVersion: 1,
      blocks: [
        { id: "paragraph-1", type: "paragraph", text: "Missing id" },
        { id: "duplicate", type: "paragraph", text: "First duplicate" },
        { id: "duplicate-3", type: "heading", attrs: { level: 3 }, text: "Second duplicate" }
      ]
    });
  });

  it("preserves nested v1 child blocks in parent-child order", () => {
    const snapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [
        {
          id: "parent-1",
          type: "bulletList",
          text: "Parent",
          content: [{ id: "child-1", type: "paragraph", text: "Nested note" }]
        }
      ]
    };

    expect(blockNoteBlocksToSnapshot(snapshotToBlockNoteBlocks(snapshot))).toEqual(snapshot);
  });
});
