import type { EditorBlock } from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttachmentBlock } from "./AttachmentBlock";
import { openAttachmentDownload, uploadAttachment } from "./uploadAttachment";

vi.mock("./uploadAttachment", () => ({
  openAttachmentDownload: vi.fn(),
  uploadAttachment: vi.fn()
}));

const baseImageBlock: EditorBlock & { readonly type: "image" } = {
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
    },
    caption: "Original caption",
    altText: "Original alt",
    description: "Original description",
    previewWidth: 420,
    showPreview: true
  }
};

describe("AttachmentBlock", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("edits safe display metadata without mutating attachment identity", () => {
    const onChange = vi.fn();

    render(
      <AttachmentBlock
        block={baseImageBlock}
        documentId="doc-1"
        index={1}
        onChange={onChange}
        onRemove={vi.fn()}
        readOnly={false}
      />
    );

    fireEvent.change(screen.getByLabelText("Block 2 image caption"), {
      target: { value: " Updated caption " }
    });

    expect(onChange).toHaveBeenLastCalledWith({
      ...baseImageBlock,
      attrs: {
        attachment: baseImageBlock.attrs?.attachment,
        caption: "Updated caption",
        altText: "Original alt",
        description: "Original description",
        previewWidth: 420,
        showPreview: true
      }
    });
  });

  it("preserves display metadata and block id when replacing an attachment", async () => {
    vi.mocked(uploadAttachment).mockResolvedValue({
      attachmentId: "attachment-2",
      documentId: "doc-1",
      blockType: "image",
      fileName: "replacement.png",
      mimeType: "image/png",
      sizeBytes: 256,
      checksum: "sha256:def",
      etag: "etag-2",
      createdAt: "2026-06-18T11:00:00.000Z"
    });
    const onChange = vi.fn();

    render(
      <AttachmentBlock
        block={baseImageBlock}
        documentId="doc-1"
        index={1}
        onChange={onChange}
        onRemove={vi.fn()}
        readOnly={false}
      />
    );

    const input = screen.getByLabelText("Block 2 image upload") as HTMLInputElement;
    const file = new File(["image"], "replacement.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledWith({
      documentId: "doc-1",
      blockType: "image",
      file
    }));
    expect(onChange).toHaveBeenCalledWith({
      ...baseImageBlock,
      attachmentId: "attachment-2",
      attrs: {
        ...baseImageBlock.attrs,
        attachment: {
          fileName: "replacement.png",
          mimeType: "image/png",
          sizeBytes: 256,
          checksum: "sha256:def",
          uploadedAt: "2026-06-18T11:00:00.000Z"
        }
      }
    });
  });

  it("hides mutation controls in read-only mode while preserving open/download", () => {
    render(
      <AttachmentBlock
        block={baseImageBlock}
        documentId="doc-1"
        index={1}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        readOnly
      />
    );

    expect(screen.queryByLabelText("Block 2 image upload")).toBeNull();
    expect(screen.queryByLabelText("Block 2 image caption")).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove block" })).toBeNull();
    expect(screen.getAllByText("Original caption")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Open attachment" })).toBeTruthy();
  });

  it("loads previews through transient download resolution", async () => {
    vi.mocked(openAttachmentDownload).mockImplementation(async ({ opener }) => {
      opener?.("https://example.test/transient-preview");
      return {
        id: "attachment-1",
        documentId: "doc-1",
        uploadedByUserId: "user-1",
        fileName: "figure.svg",
        mimeType: "image/svg+xml",
        sizeBytes: 128,
        checksum: null,
        etag: null,
        createdAt: "2026-06-18T10:00:00.000Z"
      };
    });

    render(
      <AttachmentBlock
        block={baseImageBlock}
        documentId="doc-1"
        index={1}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        readOnly={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Load private preview" }));

    expect(await screen.findByRole("img", { name: "Original alt" })).toHaveProperty(
      "src",
      "https://example.test/transient-preview"
    );
  });

  it("opens the file picker from empty card click and keyboard activation", () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <AttachmentBlock
        block={{ id: "image-empty", type: "image" }}
        documentId="doc-1"
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        readOnly={false}
      />
    );

    fireEvent.click(screen.getByLabelText("Block 1 image attachment"));
    fireEvent.keyDown(screen.getByLabelText("Block 1 image attachment"), { key: "Enter" });
    fireEvent.keyDown(screen.getByLabelText("Block 1 image attachment"), { key: " " });

    expect(inputClick).toHaveBeenCalledTimes(3);
  });

  it("uploads pasted files through the same safe upload pathway", async () => {
    vi.mocked(uploadAttachment).mockResolvedValue({
      attachmentId: "attachment-paste",
      documentId: "doc-1",
      blockType: "file",
      fileName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      checksum: null,
      etag: "etag-paste",
      createdAt: "2026-06-18T12:00:00.000Z"
    });
    const onChange = vi.fn();
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });

    render(
      <AttachmentBlock
        block={{ id: "file-empty", type: "file" }}
        documentId="doc-1"
        index={0}
        onChange={onChange}
        onRemove={vi.fn()}
        readOnly={false}
      />
    );

    fireEvent.paste(screen.getByLabelText("Block 1 file attachment"), {
      clipboardData: {
        items: [{ kind: "file", getAsFile: () => file }],
        files: []
      }
    });

    await waitFor(() => expect(uploadAttachment).toHaveBeenCalledWith({
      documentId: "doc-1",
      blockType: "file",
      file
    }));
    expect(onChange).toHaveBeenCalledWith({
      id: "file-empty",
      type: "file",
      attachmentId: "attachment-paste",
      attrs: {
        attachment: {
          fileName: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 5,
          checksum: null,
          uploadedAt: "2026-06-18T12:00:00.000Z"
        }
      }
    });
  });

  it("rejects non-image files before uploading from image blocks", async () => {
    render(
      <AttachmentBlock
        block={{ id: "image-empty", type: "image" }}
        documentId="doc-1"
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        readOnly={false}
      />
    );

    const input = screen.getByLabelText("Block 1 image upload") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["notes"], "notes.txt", { type: "text/plain" })] } });

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Image blocks only accept image files."));
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("renders retryable runtime upload failures without false attachment success", () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <AttachmentBlock
        block={{ id: "file-failed", type: "file" }}
        documentId="doc-1"
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
        readOnly={false}
        runtimeUpload={{
          status: "error",
          message: "Attachment direct upload failed.",
          fileName: "failed-notes.txt",
          mimeType: "text/plain",
          sizeBytes: 12
        }}
      />
    );

    expect(screen.getByText("No attachment linked")).toBeTruthy();
    expect(screen.getByText("failed-notes.txt")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Attachment direct upload failed.");
    expect(screen.getByRole("button", { name: "Open attachment" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    expect(inputClick).toHaveBeenCalledTimes(1);
  });
});
