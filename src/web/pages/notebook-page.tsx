import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type { DocumentBlockDocument } from "@shared/contracts/document-content";
import type {
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
} from "@shared/contracts/notebook";

import { DocumentBlockEditor } from "../components/document-block-editor";
import {
  createEditableDocumentContent,
  createLegacyTextProjection,
} from "../lib/document-blocks";
import { apiClient, ApiError } from "../lib/http-client";

const DEFAULT_NOTEBOOK_TITLE = "Private research notebook";

type PageStatus = "idle" | "loading" | "saving";

function decodeRouteDocumentId(documentId: string | undefined): string {
  if (!documentId) {
    return "";
  }

  try {
    return decodeURIComponent(documentId);
  } catch {
    return documentId;
  }
}

export function NotebookPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { documentId: routeDocumentId } = useParams<{ documentId?: string }>();
  const routeParams = new URLSearchParams(location.search);
  const adoptionProjectId = routeParams.get("adoptProjectId")?.trim() || "";
  const adoptionProjectDocId = routeParams.get("adoptProjectDocId")?.trim() || "";
  const [documents, setDocuments] = useState<NotebookDocumentRecord[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [snapshot, setSnapshot] = useState<NotebookDocumentSnapshot | null>(null);
  const [draftDocumentContent, setDraftDocumentContent] = useState<DocumentBlockDocument>(
    () => createEditableDocumentContent(),
  );
  const [newNotebookTitle, setNewNotebookTitle] = useState(DEFAULT_NOTEBOOK_TITLE);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId],
  );

  const preferredRouteDocumentId = decodeRouteDocumentId(routeDocumentId);

  async function loadNotebookList(preferredDocumentId?: string): Promise<void> {
    setStatus("loading");
    setError(null);

    try {
      const response = await apiClient.listNotebooks();
      setDocuments(response.documents);
      const visiblePreferredDocument = response.documents.find((document) =>
        document.id === preferredDocumentId
      );
      const nextDocumentId =
        visiblePreferredDocument?.id || response.documents[0]?.id || "";
      setSelectedDocumentId(nextDocumentId);

      if (nextDocumentId) {
        const nextSnapshot = await apiClient.getNotebookSnapshot(nextDocumentId);
        setSnapshot(nextSnapshot);
        setDraftDocumentContent(createEditableDocumentContent(nextSnapshot));
      } else {
        setSnapshot(null);
        setDraftDocumentContent(createEditableDocumentContent());
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load private notebooks.",
      );
      setSnapshot(null);
      setDraftDocumentContent(createEditableDocumentContent());
    } finally {
      setStatus("idle");
    }
  }

  useEffect(() => {
    void loadNotebookList(preferredRouteDocumentId);
  }, [preferredRouteDocumentId]);

  async function handleSelectDocument(documentId: string): Promise<void> {
    setSelectedDocumentId(documentId);
    setStatus("loading");
    setError(null);
    setMessage(null);

    try {
      const nextSnapshot = await apiClient.getNotebookSnapshot(documentId);
      setSnapshot(nextSnapshot);
      setDraftDocumentContent(createEditableDocumentContent(nextSnapshot));
    } catch (loadError) {
      setSnapshot(null);
      setDraftDocumentContent(createEditableDocumentContent());
      setError(
        loadError instanceof ApiError && loadError.status === 403
          ? "Unauthorized: this private Notebook belongs to another user."
          : loadError instanceof Error
            ? loadError.message
            : "Failed to open the private Notebook.",
      );
    } finally {
      setStatus("idle");
    }
  }

  async function handleCreateNotebook(): Promise<void> {
    const title = newNotebookTitle.trim() || DEFAULT_NOTEBOOK_TITLE;
    setStatus("saving");
    setError(null);
    setMessage(null);

    try {
      const document = await apiClient.createNotebook({ title });
      await loadNotebookList(document.id);
      setNewNotebookTitle(DEFAULT_NOTEBOOK_TITLE);
      setMessage(`Created private Notebook "${document.title}".`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Failed to create the private Notebook.",
      );
      setStatus("idle");
    }
  }

  async function handleSaveNotebook(): Promise<void> {
    if (!selectedDocument) {
      return;
    }

    setStatus("saving");
    setError(null);
    setMessage(null);

    try {
      const savedSnapshot = await apiClient.saveNotebookVersion(selectedDocument.id, {
        citations: [],
        documentContent: draftDocumentContent,
      });
      setSnapshot(savedSnapshot);
      setDraftDocumentContent(createEditableDocumentContent(savedSnapshot));
      const response = await apiClient.listNotebooks();
      setDocuments(response.documents);
      setSelectedDocumentId(savedSnapshot.document.id);
      setMessage(`Saved ${savedSnapshot.document.title} version ${savedSnapshot.versionNumber}.`);
    } catch (saveError) {
      setError(
        saveError instanceof ApiError && saveError.status === 403
          ? "Unauthorized: this private Notebook belongs to another user."
          : saveError instanceof Error
            ? saveError.message
            : "Failed to save the private Notebook.",
      );
      setStatus("idle");
    }
  }

  const isLoading = status === "loading";
  const isSaving = status === "saving";
  const draftProjection = createLegacyTextProjection(draftDocumentContent);
  const adoptionSearch = adoptionProjectId || adoptionProjectDocId
    ? `?adoptProjectId=${encodeURIComponent(adoptionProjectId)}&adoptProjectDocId=${encodeURIComponent(adoptionProjectDocId)}`
    : "";
  const canAdoptIntoProjectDoc = Boolean(
    selectedDocument && adoptionProjectId && adoptionProjectDocId,
  );

  async function handleAdoptIntoProjectDoc(): Promise<void> {
    if (!selectedDocument || !canAdoptIntoProjectDoc) {
      setError(
        "Open Notebook with a server-visible Project Doc adoption link before adopting private content.",
      );
      return;
    }

    setStatus("saving");
    setError(null);
    setMessage(null);

    try {
      const response = await apiClient.adoptNotebookIntoProjectDoc(
        adoptionProjectDocId,
        {
          notebookDocumentId: selectedDocument.id,
        },
      );

      setMessage(
        `Adopted Notebook version ${response.provenance.sourceNotebookVersionNumber} into Project Doc version ${response.provenance.projectDocVersionNumber}.`,
      );
      navigate(
        `/projects/${encodeURIComponent(response.provenance.projectId)}/writing/${encodeURIComponent(response.provenance.projectDocId)}`,
      );
    } catch (adoptionError) {
      setError(
        adoptionError instanceof Error
          ? adoptionError.message
          : "Failed to adopt the private Notebook into the Project Doc.",
      );
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Private Notebook · owner-only synthesis</p>
        <h1 className="page-title">Notebook</h1>
        <p className="page-description">
          Capture source-backed evidence and write private interpretations in a server-persisted
          Notebook that only the current owner can open or mutate.
        </p>
      </header>

      <section aria-label="notebook context" className="context-bar">
        <span>Private surface</span>
        <span className="status-badge">owner-only</span>
        <span className="status-badge">server-saved versions</span>
        {snapshot ? <span>Version · {snapshot.versionNumber}</span> : null}
      </section>

      <section className="panel-grid" aria-label="notebook workspace">
        <aside className="panel">
          <h2 className="panel-title">Private notebooks</h2>
          {isLoading ? (
            <p className="quiet-copy">Loading private Notebook documents…</p>
          ) : documents.length === 0 ? (
            <p className="quiet-copy">No private Notebook documents yet.</p>
          ) : (
            <div className="stack-xs">
              {documents.map((document) => (
                <button
                  className="panel-link"
                  key={document.id}
                  type="button"
                  onClick={() => navigate(`/notebook/${encodeURIComponent(document.id)}${adoptionSearch}`)}
                >
                  {document.title}
                </button>
              ))}
            </div>
          )}

          <label className="quiet-copy" htmlFor="new-notebook-title">
            New Notebook title
          </label>
          <input
            id="new-notebook-title"
            value={newNotebookTitle}
            onChange={(event) => setNewNotebookTitle(event.target.value)}
          />
          <button
            className="action-button"
            type="button"
            disabled={isLoading || isSaving}
            onClick={() => void handleCreateNotebook()}
          >
            {isSaving && !selectedDocument ? "Creating…" : "Create Notebook"}
          </button>
        </aside>

        <article className="panel">
          <h2 className="panel-title">
            {selectedDocument?.title ?? "No Notebook selected"}
          </h2>
          {error ? <p className="quiet-copy" role="alert">{error}</p> : null}
          {message ? <p className="quiet-copy">{message}</p> : null}

          {selectedDocument ? (
            <>
              <DocumentBlockEditor
                disabled={isLoading || isSaving}
                label="Editable private Notebook content"
                value={draftDocumentContent}
                onChange={setDraftDocumentContent}
              />
              <div className="context-bar">
                <button
                  className="action-button"
                  type="button"
                  disabled={isLoading || isSaving}
                  onClick={() => void handleSaveNotebook()}
                >
                  {isSaving ? "Saving…" : "Save Notebook"}
                </button>
                <button
                  className="action-button action-button-secondary"
                  type="button"
                  disabled={isLoading || isSaving}
                  onClick={() => void handleSelectDocument(selectedDocument.id)}
                >
                  Reload Notebook
                </button>
                {canAdoptIntoProjectDoc ? (
                  <button
                    className="action-button action-button-secondary"
                    type="button"
                    disabled={isLoading || isSaving}
                    onClick={() => void handleAdoptIntoProjectDoc()}
                  >
                    {isSaving ? "Adopting…" : "Adopt into Project Doc"}
                  </button>
                ) : null}
              </div>
              {adoptionProjectId || adoptionProjectDocId ? (
                <p className="quiet-copy">
                  Project Doc adoption target · {adoptionProjectDocId || "missing document"}. The server will verify ProjectMember access and Notebook ownership before copying anything into project scope.
                </p>
              ) : null}
              {snapshot ? (
                <p className="quiet-copy">
                  Saved snapshot · {snapshot.versionId} · {snapshot.citations.length} citation(s)
                </p>
              ) : null}
              <p className="quiet-copy">
                Current legacy projection size · {draftProjection.length} characters
              </p>
            </>
          ) : (
            <p className="quiet-copy">
              Create a private Notebook or select one from the owner-scoped list.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
