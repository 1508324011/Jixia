import type { DocumentDTO, EditorSnapshot } from "@jixia/shared";
import { describe, expect, it } from "vitest";

import { createDocumentCopilotContext, extractPlainTextFromSnapshot } from "./documentCopilotContext";

const documentRecord: DocumentDTO = {
  id: "doc-1",
  type: "project",
  status: "active",
  title: "Server title",
  ownerUserId: null,
  projectId: "project-1",
  currentRevisionId: "revision-2",
  revisionNumber: 2,
  createdAt: "2026-06-21T10:00:00.000Z",
  updatedAt: "2026-06-21T10:05:00.000Z"
};

describe("document copilot context", () => {
  it("builds one explicit current-document context snapshot from safe editor text", () => {
    const snapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [
        { id: "heading-1", type: "heading", attrs: { level: 2 }, text: "Research notes" },
        { id: "paragraph-1", type: "paragraph", text: "Finding with useful detail." },
        {
          id: "image-1",
          type: "image",
          attachmentId: "attachment-1",
          attrs: {
            attachment: {
              fileName: "figure.png",
              mimeType: "image/png",
              sizeBytes: 2048,
              checksum: "sha256:abc",
              uploadedAt: "2026-06-21T10:04:00.000Z"
            }
          }
        }
      ]
    };

    const context = createDocumentCopilotContext({
      baseRevision: 2,
      capturedAt: new Date("2026-06-21T11:00:00.000Z"),
      document: documentRecord,
      readOnly: false,
      snapshot,
      title: "Runtime title token: redact-me"
    });

    expect(context.snapshot.currentDocumentId).toBe("doc-1");
    expect(context.snapshot.items).toHaveLength(1);
    expect(context.snapshot.items[0]).toEqual(expect.objectContaining({
      sourceType: "current_document",
      documentId: "doc-1",
      documentType: "project",
      projectId: "project-1",
      title: "Runtime title [redacted secret]",
      revisionNumber: 2,
      selectedBlockIds: []
    }));
    expect(context.snapshot.items[0]?.content).toContain("Document title: Runtime title [redacted secret]");
    expect(context.snapshot.items[0]?.content).toContain("Base revision: 2");
    expect(context.snapshot.items[0]?.content).toContain("Selected blocks: not implemented; current-document context only.");
    expect(context.snapshot.items[0]?.content).toContain("Research notes");
    expect(context.snapshot.items[0]?.content).toContain("Finding with useful detail.");
    expect(context.snapshot.items[0]?.content).toContain("[Image attachment: figure.png · image/png · 2.0 KB]");
    expect(JSON.stringify(context)).not.toMatch(/redact-me|attachment-1/);
    expect(context.summary).toEqual(expect.objectContaining({
      documentId: "doc-1",
      baseRevision: 2,
      currentRevision: 2,
      blockCount: 3,
      selectedBlockCount: 0,
      truncated: false
    }));
  });

  it("bounds oversized text without sending raw snapshot JSON", () => {
    const snapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [{ id: "paragraph-1", type: "paragraph", text: "A".repeat(900) }]
    };

    const context = createDocumentCopilotContext({
      baseRevision: 2,
      capturedAt: new Date("2026-06-21T11:00:00.000Z"),
      document: documentRecord,
      maxCharacters: 500,
      readOnly: false,
      snapshot,
      title: "Runtime title"
    });

    expect(context.summary.truncated).toBe(true);
    expect(context.snapshot.items[0]?.content).toContain("Context truncated at 500 characters");
    expect(context.snapshot.items[0]?.content).not.toContain("editorSchemaVersion");
    expect(context.snapshot.items[0]?.content).not.toContain("paragraph-1");
  });

  it("extracts deterministic text from nested blocks", () => {
    const snapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [
        {
          id: "parent-1",
          type: "bulletList",
          text: "Parent",
          content: [{ id: "child-1", type: "todo", attrs: { checked: true }, text: "Child task" }]
        }
      ]
    };

    expect(extractPlainTextFromSnapshot(snapshot)).toBe("- Parent\n  [x] Child task");
  });
});
