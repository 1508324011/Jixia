import type { DocumentDTO, EditorSnapshot, SaveDocumentRevisionConflictResponse, SaveDocumentRevisionResponse } from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor, act, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentEditorPage } from "./DocumentEditorPage";

const editorHarness = vi.hoisted(() => ({
  exportedSnapshot: null as EditorSnapshot | null
}));

const mockedEditorProps = vi.hoisted(() => ({
  calls: [] as { readonly documentId: string; readonly readOnly: boolean }[]
}));

vi.mock("./editor/JixiaEditor", async () => {
  const React = await import("react");

  return {
    JixiaEditor: React.forwardRef(function MockJixiaEditor(
    props: {
      readonly documentId: string;
      readonly onChange: (nextSnapshot: EditorSnapshot) => void;
      readonly readOnly?: boolean;
      readonly value: EditorSnapshot;
    },
    ref
  ) {
    React.useImperativeHandle(ref, () => ({
      exportSnapshot: () => editorHarness.exportedSnapshot ?? props.value
    }), [props.value]);

    mockedEditorProps.calls.push({ documentId: props.documentId, readOnly: props.readOnly ?? false });

    return (
      <section aria-label="Mock Jixia editor" data-document-id={props.documentId} data-readonly={props.readOnly ? "true" : "false"}>
        <p>{props.value.blocks[0]?.text ?? ""}</p>
        <button
          disabled={props.readOnly}
          onClick={() => {
            const nextSnapshot = editorHarness.exportedSnapshot ?? props.value;
            props.onChange(nextSnapshot);
          }}
          type="button"
        >
          Simulate editor change
        </button>
      </section>
    );
  })
  };
});

const baseDocument: DocumentDTO = {
  id: "doc-1",
  type: "project",
  status: "active",
  title: "Project synthesis",
  ownerUserId: null,
  projectId: "project-1",
  currentRevisionId: "revision-2",
  revisionNumber: 2,
  createdAt: "2026-06-16T10:00:00.000Z",
  updatedAt: "2026-06-16T10:10:00.000Z"
};

const baseSnapshot: EditorSnapshot = {
  editorSchemaVersion: 1,
  blocks: [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "Initial finding"
    }
  ]
};

const currentConflictSnapshot: EditorSnapshot = {
  editorSchemaVersion: 1,
  blocks: [
    {
      id: "heading-1",
      type: "heading",
      text: "Server version"
    }
  ]
};

describe("DocumentEditorPage", () => {
  afterEach(() => {
    cleanup();
    editorHarness.exportedSnapshot = null;
    mockedEditorProps.calls = [];
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads a document and renders the shared editor boundary", async () => {
    const fetchMock = mockFetchSequence(readDocumentResponse());

    render(<DocumentEditorPage documentId="doc-1" />);

    expect(await screen.findByDisplayValue("Project synthesis")).toBeTruthy();
    expect(screen.getByText("Initial finding")).toBeTruthy();
    expect(screen.getByLabelText("Mock Jixia editor").getAttribute("data-readonly")).toBe("false");
    expect(screen.getByText("Use the standalone AI workspace")).toBeTruthy();
    expect(screen.getByText("No automatic document context")).toBeTruthy();
    expect(
      within(screen.getByLabelText("Document inspector")).queryByRole("button", {
        name: /open copilot|send|apply|insert|rewrite|automerge|stop|cancel/i
      })
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/doc-1",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("uses the same editor boundary for project and notebook document records", async () => {
    const fetchMock = mockFetchSequence(
      readDocumentResponse({ id: "project-doc-1", type: "project", projectId: "project-1", ownerUserId: null }),
      readDocumentResponse({ id: "notebook-doc-1", type: "notebook", projectId: null, ownerUserId: "user-1" })
    );
    const { rerender } = render(<DocumentEditorPage documentId="project-doc-1" />);

    expect(await screen.findByDisplayValue("Project synthesis")).toBeTruthy();
    expect(mockedEditorProps.calls.at(-1)).toEqual({ documentId: "project-doc-1", readOnly: false });

    rerender(<DocumentEditorPage backLabel="Notebook" documentId="notebook-doc-1" onBack={vi.fn()} />);

    expect(await screen.findByText("Notebook")).toBeTruthy();
    expect(mockedEditorProps.calls.at(-1)).toEqual({ documentId: "notebook-doc-1", readOnly: false });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/documents/project-doc-1",
      "/api/documents/notebook-doc-1"
    ]);
  });

  it("autosaves drafts with the current body and base revision", async () => {
    const draftSnapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [{ id: "paragraph-1", type: "paragraph", text: "Draft body" }]
    };
    const fetchMock = mockFetchSequence(
      readDocumentResponse(),
      {
        draft: {
          documentId: "doc-1",
          userId: "user-1",
          baseRevision: 2,
          draftContent: draftSnapshot,
          updatedAt: "2026-06-16T10:12:00.000Z"
        }
      }
    );

    render(<DocumentEditorPage documentId="doc-1" />);

    await screen.findByText("Initial finding");
    editorHarness.exportedSnapshot = draftSnapshot;
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Simulate editor change" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [draftUrl, draftInit] = fetchMock.mock.calls[1] ?? [];
    expect(draftUrl).toBe("/api/documents/doc-1/draft");
    expect(draftInit).toEqual(
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        body: JSON.stringify({
          documentId: "doc-1",
          baseRevision: 2,
          draftContent: draftSnapshot
        })
      })
    );
  });

  it("formally saves revisions with baseRevision and updates visible revision state", async () => {
    const runtimeSnapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [{ id: "paragraph-1", type: "paragraph", text: "Runtime save body" }]
    };
    const savedResponse: SaveDocumentRevisionResponse = {
      outcome: "saved",
      document: {
        ...baseDocument,
        currentRevisionId: "revision-3",
        revisionNumber: 3,
        updatedAt: "2026-06-16T10:15:00.000Z"
      },
      revision: {
        id: "revision-3",
        documentId: "doc-1",
        revisionNumber: 3,
        contentSnapshot: runtimeSnapshot,
        editorUserId: "user-1",
        createdAt: "2026-06-16T10:15:00.000Z"
      }
    };
    const fetchMock = mockFetchSequence(readDocumentResponse(), savedResponse);

    render(<DocumentEditorPage documentId="doc-1" />);

    await screen.findByDisplayValue("Project synthesis");
    editorHarness.exportedSnapshot = runtimeSnapshot;
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));

    await waitFor(() => expect(screen.getByText("Base revision 3")).toBeTruthy());

    const [saveUrl, saveInit] = fetchMock.mock.calls[1] ?? [];
    expect(saveUrl).toBe("/api/documents/doc-1/revisions");
    expect(saveInit).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          documentId: "doc-1",
          baseRevision: 2,
          contentSnapshot: runtimeSnapshot,
          title: "Project synthesis"
        })
      })
    );
    expect(screen.getByText("Formal revision saved.")).toBeTruthy();
  });

  it("exports the runtime snapshot for formal save without scheduling draft autosave", async () => {
    const runtimeSnapshot: EditorSnapshot = {
      editorSchemaVersion: 1,
      blocks: [{ id: "paragraph-1", type: "paragraph", text: "Runtime-only body" }]
    };
    const savedResponse: SaveDocumentRevisionResponse = {
      outcome: "saved",
      document: {
        ...baseDocument,
        currentRevisionId: "revision-3",
        revisionNumber: 3,
        updatedAt: "2026-06-16T10:15:00.000Z"
      },
      revision: {
        id: "revision-3",
        documentId: "doc-1",
        revisionNumber: 3,
        contentSnapshot: runtimeSnapshot,
        editorUserId: "user-1",
        createdAt: "2026-06-16T10:15:00.000Z"
      }
    };
    const fetchMock = mockFetchSequence(readDocumentResponse(), savedResponse);

    render(<DocumentEditorPage documentId="doc-1" />);

    await screen.findByDisplayValue("Project synthesis");
    editorHarness.exportedSnapshot = runtimeSnapshot;
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));

    await waitFor(() => expect(screen.getByText("Formal revision saved.")).toBeTruthy());
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/draft"))).toBe(true);
  });

  it("shows a human-only conflict view without calling AI routes", async () => {
    const conflictResponse: SaveDocumentRevisionConflictResponse = {
      outcome: "conflict",
      documentId: "doc-1",
      currentRevisionNumber: 3,
      currentSnapshot: currentConflictSnapshot,
      submittedBaseRevision: 2,
      submittedSnapshot: baseSnapshot
    };
    const fetchMock = mockFetchSequence(readDocumentResponse(), {
      payload: conflictResponse,
      status: 409
    });

    render(<DocumentEditorPage documentId="doc-1" />);

    await screen.findByDisplayValue("Project synthesis");
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));

    expect(await screen.findByText("Human merge required")).toBeTruthy();
    expect(screen.getByText(/does not call AI or auto-merge conflicts/i)).toBeTruthy();
    expect(screen.getByText(/revision 3 exists/i)).toBeTruthy();
    expect(screen.getByText("Human merge required").closest(".jixia-workspace-frame__messages")).toBeTruthy();
    expect(screen.getByLabelText("Document artifact canvas").closest(".jixia-workspace-main-split")).toBeTruthy();
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/ai"))).toBe(true);
  });

  it("keeps archived documents read-only and does not draft autosave", async () => {
    const fetchMock = mockFetchSequence(readDocumentResponse({ status: "archived" }));

    render(<DocumentEditorPage documentId="doc-1" />);

    const titleInput = (await screen.findByLabelText("Document title")) as HTMLInputElement;
    const saveButton = screen.getByRole("button", { name: "Save revision" });
    const editorChangeButton = screen.getByRole("button", { name: "Simulate editor change" });

    expect(titleInput.disabled).toBe(true);
    expect(editorChangeButton).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Mock Jixia editor").getAttribute("data-readonly")).toBe("true");
    expect(saveButton).toHaveProperty("disabled", true);
    expect(screen.getByText("Archived documents are read-only.")).toBeTruthy();

    vi.useFakeTimers();
    editorHarness.exportedSnapshot = {
      editorSchemaVersion: 1,
      blocks: [{ id: "paragraph-1", type: "paragraph", text: "Should not autosave" }]
    };
    fireEvent.click(editorChangeButton);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/draft"))).toBe(true);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/revisions"))).toBe(true);
  });
});

function readDocumentResponse(documentOverrides: Partial<DocumentDTO> = {}) {
  return {
    document: { ...baseDocument, ...documentOverrides },
    revision: {
      id: "revision-2",
      documentId: "doc-1",
      revisionNumber: 2,
      contentSnapshot: baseSnapshot,
      editorUserId: "user-1",
      createdAt: "2026-06-16T10:10:00.000Z"
    },
    currentSnapshot: baseSnapshot
  };
}

type MockResponseInput =
  | unknown
  | {
      readonly payload: unknown;
      readonly status: number;
    };

function mockFetchSequence(...responses: readonly MockResponseInput[]) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const response of responses) {
    if (isStatusResponse(response)) {
      fetchMock.mockResolvedValueOnce(jsonResponse(response.payload, response.status));
    } else {
      fetchMock.mockResolvedValueOnce(jsonResponse(response, 200));
    }
  }

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function isStatusResponse(
  response: MockResponseInput
): response is { readonly payload: unknown; readonly status: number } {
  return typeof response === "object" && response !== null && "payload" in response && "status" in response;
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
