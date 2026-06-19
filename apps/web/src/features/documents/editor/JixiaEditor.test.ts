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
        { id: "code-1", type: "codeBlock", attrs: { language: "ts", wrap: true }, text: "const checked = true;" },
        { id: "divider-1", type: "divider" },
        { id: "table-1", type: "table", text: "| Column | Value |\n| --- | --- |\n| Source | Paper |" },
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
            },
            caption: "Figure 1",
            altText: "Network diagram",
            description: "Private analysis figure",
            previewWidth: 520,
            showPreview: true
          }
        },
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
            },
            caption: "Protocol",
            description: "Wet lab protocol PDF",
            showPreview: false
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
            },
            caption: "  Private figure caption  ",
            altText: "Image alt text",
            description: "Description text",
            previewWidth: 9999,
            showPreview: false,
            authorization: "Bearer secret",
            providerPrompt: "never persist"
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
            },
            caption: "Private figure caption",
            altText: "Image alt text",
            description: "Description text",
            previewWidth: 820,
            showPreview: false
          }
        }
      ]
    });
    expect(JSON.stringify(exported)).not.toMatch(/signedUrl|storageKey|authorization|providerPrompt|Bearer|tenant\/private\/object/);
  });

  it("exports code blocks from block-local controls with safe language and wrap metadata", () => {
    const exported = blockNoteBlocksToSnapshot([
      {
        id: "code-1",
        type: "jixiaCodeBlock",
        props: {
          language: "python",
          wrap: true,
          hasWrap: true
        },
        content: [
          { type: "text", text: "print('hello')" },
          { type: "hardBreak" },
          { type: "text", text: "print('world')" }
        ],
        children: []
      }
    ]);

    expect(exported).toEqual({
      editorSchemaVersion: 1,
      blocks: [
        {
          id: "code-1",
          type: "codeBlock",
          attrs: {
            language: "python",
            wrap: true
          },
          text: "print('hello')\nprint('world')"
        }
      ]
    });
  });

  it("drops runtime upload placeholder props from persisted attachment snapshots", () => {
    const exported = blockNoteBlocksToSnapshot([
      {
        id: "image-upload-1",
        type: "jixiaImage",
        props: {
          attachmentId: "",
          fileName: "",
          mimeType: "",
          sizeBytes: 0,
          checksum: "",
          uploadedAt: "",
          uploadStatus: "error",
          uploadMessage: "failed at https://storage.example.test/private?signature=secret",
          pendingFileName: "private-figure.png",
          pendingMimeType: "image/png",
          pendingSizeBytes: 128,
          caption: "",
          altText: "",
          description: "",
          previewWidth: 420,
          showPreview: true,
          hasCaption: false,
          hasAltText: false,
          hasDescription: false,
          hasPreviewWidth: false,
          hasShowPreview: false
        },
        children: []
      }
    ]);

    expect(exported).toEqual({
      editorSchemaVersion: 1,
      blocks: [{ id: "image-upload-1", type: "image" }]
    });
    expect(JSON.stringify(exported)).not.toMatch(/uploadStatus|uploadMessage|pending|storage|signature|https?:\/\//i);
  });

  it("does not add default attachment display metadata to legacy v1 blocks", () => {
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
              checksum: null,
              uploadedAt: "2026-06-18T10:00:00.000Z"
            }
          }
        }
      ]
    };

    expect(blockNoteBlocksToSnapshot(snapshotToBlockNoteBlocks(snapshot))).toEqual(snapshot);
  });

  it("exports edited attachment props as safe v1 attrs while keeping the block id stable", () => {
    const exported = blockNoteBlocksToSnapshot([
      {
        id: "image-1",
        type: "jixiaImage",
        props: {
          attachmentId: "attachment-2",
          fileName: "replacement.png",
          mimeType: "image/png",
          sizeBytes: 512,
          checksum: "sha256:def",
          uploadedAt: "2026-06-18T11:00:00.000Z",
          caption: "Existing caption",
          altText: "Updated alt",
          description: "Existing description",
          previewWidth: 480,
          showPreview: true,
          hasCaption: true,
          hasAltText: true,
          hasDescription: true,
          hasPreviewWidth: true,
          hasShowPreview: true,
          signedUrl: "https://example.test/leak"
        },
        children: []
      }
    ]);

    expect(exported).toEqual({
      editorSchemaVersion: 1,
      blocks: [
        {
          id: "image-1",
          type: "image",
          attachmentId: "attachment-2",
          attrs: {
            attachment: {
              fileName: "replacement.png",
              mimeType: "image/png",
              sizeBytes: 512,
              checksum: "sha256:def",
              uploadedAt: "2026-06-18T11:00:00.000Z"
            },
            caption: "Existing caption",
            altText: "Updated alt",
            description: "Existing description",
            previewWidth: 480,
            showPreview: true
          }
        }
      ]
    });
    expect(JSON.stringify(exported)).not.toContain("signedUrl");
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
