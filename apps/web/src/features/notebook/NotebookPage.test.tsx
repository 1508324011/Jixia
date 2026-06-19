import type { CreateDocumentResponse, DocumentDTO, ListDocumentsResponse } from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotebookPage } from "./NotebookPage";

const notebookDocument: DocumentDTO = {
  id: "notebook-doc-1",
  type: "notebook",
  status: "active",
  title: "Personal synthesis",
  ownerUserId: "user-1",
  projectId: null,
  currentRevisionId: null,
  revisionNumber: 0,
  createdAt: "2026-06-18T09:00:00.000Z",
  updatedAt: "2026-06-18T09:05:00.000Z"
};

describe("NotebookPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lists server-authorized notebook documents", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ documents: [notebookDocument] } satisfies ListDocumentsResponse)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<NotebookPage onOpenDocument={vi.fn()} />);

    expect(await screen.findByText("Personal synthesis")).toBeTruthy();
    expect(screen.getByText("Notebook documents are returned by the API for the current owner only. Creating a note sends notebook-scoped intent to the same document service used by Project Docs.")).toBeTruthy();
    expect(screen.getByText("1 loaded")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/notebook",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("creates notebook documents through the notebook endpoint and opens the shared editor route", async () => {
    const onOpenDocument = vi.fn();
    const createdDocument: DocumentDTO = {
      ...notebookDocument,
      id: "notebook-doc-2",
      title: "Fresh note",
      updatedAt: "2026-06-18T09:10:00.000Z"
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ documents: [notebookDocument] } satisfies ListDocumentsResponse))
      .mockResolvedValueOnce(
        jsonResponse({ document: createdDocument, revision: null } satisfies CreateDocumentResponse)
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<NotebookPage onOpenDocument={onOpenDocument} />);

    await screen.findByText("Personal synthesis");
    fireEvent.change(screen.getByLabelText("New notebook document"), {
      target: { value: "Fresh note" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith("notebook-doc-2"));
    expect(screen.getByText("Fresh note")).toBeTruthy();

    const [createUrl, createInit] = fetchMock.mock.calls[1] ?? [];
    expect(createUrl).toBe("/api/documents/notebook");
    expect(createInit).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ title: "Fresh note" })
      })
    );
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
