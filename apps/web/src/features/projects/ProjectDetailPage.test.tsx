import type { CreateDocumentResponse, DocumentDTO, ListDocumentsResponse, ProjectDTO } from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectDetailPage } from "./ProjectDetailPage";

const project: ProjectDTO = {
  id: "project-1",
  spaceId: "space-1",
  name: "Cancer literature review",
  createdByUserId: "project-owner",
  createdAt: "2026-06-18T08:00:00.000Z",
  updatedAt: "2026-06-18T08:30:00.000Z"
};

const projectDocument: DocumentDTO = {
  id: "project-doc-1",
  type: "project",
  status: "active",
  title: "Shared synthesis",
  ownerUserId: null,
  projectId: "project-1",
  currentRevisionId: null,
  revisionNumber: 0,
  createdAt: "2026-06-18T09:00:00.000Z",
  updatedAt: "2026-06-18T09:05:00.000Z"
};

describe("ProjectDetailPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads real project document rows without the missing-route fallback copy", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ project }))
      .mockResolvedValueOnce(jsonResponse({ documents: [projectDocument] } satisfies ListDocumentsResponse));
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectDetailPage onBack={vi.fn()} onOpenDocument={vi.fn()} projectId="project-1" />);

    expect(await screen.findByText("Shared synthesis")).toBeTruthy();
    expect(screen.getByText("Cancer literature review")).toBeTruthy();
    expect(screen.queryByText(/Project document listing is not available/i)).toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1",
      expect.objectContaining({ credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/documents",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("creates project documents through the project endpoint and opens the shared editor route", async () => {
    const onOpenDocument = vi.fn();
    const createdDocument: DocumentDTO = {
      ...projectDocument,
      id: "project-doc-2",
      title: "New shared document",
      updatedAt: "2026-06-18T09:10:00.000Z"
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ project }))
      .mockResolvedValueOnce(jsonResponse({ documents: [projectDocument] } satisfies ListDocumentsResponse))
      .mockResolvedValueOnce(
        jsonResponse({ document: createdDocument, revision: null } satisfies CreateDocumentResponse)
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ProjectDetailPage onBack={vi.fn()} onOpenDocument={onOpenDocument} projectId="project-1" />);

    await screen.findByText("Shared synthesis");
    fireEvent.change(screen.getByLabelText("New project document"), {
      target: { value: "New shared document" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith("project-doc-2"));
    expect(screen.getByText("New shared document")).toBeTruthy();

    const [createUrl, createInit] = fetchMock.mock.calls[2] ?? [];
    expect(createUrl).toBe("/api/documents/project");
    expect(createInit).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ projectId: "project-1", title: "New shared document" })
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
