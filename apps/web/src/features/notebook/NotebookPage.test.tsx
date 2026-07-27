import type {
  CreateDocumentResponse,
  DocumentDTO,
  ListDocumentsResponse,
  ListLiteratureResponse
} from "@jixia/shared";
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
    const fetchMock = createNotebookFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    render(<NotebookPage onOpenDocument={vi.fn()} />);

    expect(await screen.findByText("Personal synthesis")).toBeTruthy();
    expect(screen.getByText("Notebook documents are returned by the API for the current owner only. Creating a note sends notebook-scoped intent to the same document service used by Project Docs.")).toBeTruthy();
    expect(screen.getByText("1 loaded")).toBeTruthy();
    expect(await screen.findByText("No personal literature")).toBeTruthy();
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
    const fetchMock = createNotebookFetchMock(createdDocument);
    vi.stubGlobal("fetch", fetchMock);

    render(<NotebookPage onOpenDocument={onOpenDocument} />);

    await screen.findByText("Personal synthesis");
    fireEvent.change(screen.getByLabelText("New notebook document"), {
      target: { value: "Fresh note" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith("notebook-doc-2"));
    expect(screen.getByText("Fresh note")).toBeTruthy();

    const createCall = fetchMock.mock.calls.find(
      ([input, init]) => requestUrl(input) === "/api/documents/notebook" && init?.method === "POST"
    );
    const [createUrl, createInit] = createCall ?? [];
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

function createNotebookFetchMock(createdDocument?: DocumentDTO) {
  return vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";

    if (method === "GET" && url === "/api/documents/notebook") {
      return jsonResponse({ documents: [notebookDocument] } satisfies ListDocumentsResponse);
    }
    if (method === "GET" && url === "/api/literature?scope=personal&limit=25") {
      return jsonResponse({ literature: [], nextCursor: null } satisfies ListLiteratureResponse);
    }
    if (method === "POST" && url === "/api/documents/notebook" && createdDocument) {
      return jsonResponse({ document: createdDocument, revision: null } satisfies CreateDocumentResponse);
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
