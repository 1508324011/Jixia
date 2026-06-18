import type { CreateDocumentResponse, CreateProjectDocumentRequest, DocumentDTO } from "@jixia/shared";
import type { FormEvent } from "react";
import { useState } from "react";

import { apiFetch } from "../../lib/api";
import { Button, EmptyState, Field, ListRow, Notice, Pane, Pill } from "../layout/workbench";

type DocumentListProps = {
  readonly documents: readonly DocumentDTO[];
  readonly loadState?: "idle" | "loading" | "error";
  readonly loadMessage?: string | null;
  readonly projectId: string;
  readonly onDocumentsChanged?: (documents: readonly DocumentDTO[]) => void;
  readonly onOpenDocument: (documentId: string) => void;
};

export function DocumentList({
  documents,
  loadState = "idle",
  loadMessage,
  projectId,
  onDocumentsChanged,
  onOpenDocument
}: DocumentListProps) {
  const [title, setTitle] = useState("");
  const [createState, setCreateState] = useState<"idle" | "submitting" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreateDocument(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateState("submitting");
    setCreateError(null);

    const payload: CreateProjectDocumentRequest = {
      projectId,
      title
    };

    try {
      const response = await apiFetch<CreateDocumentResponse>("/documents/project", {
        method: "POST",
        json: payload
      });
      const nextDocuments = [response.document, ...documents.filter((document) => document.id !== response.document.id)];
      onDocumentsChanged?.(nextDocuments);
      setTitle("");
      setCreateState("idle");
      onOpenDocument(response.document.id);
    } catch (error) {
      setCreateState("error");
      setCreateError(error instanceof Error ? error.message : "Unable to create document.");
    }
  }

  return (
    <Pane
      actions={<Pill tone="accent">{documents.length} loaded</Pill>}
      aria-labelledby="project-documents-title"
      eyebrow="Project Docs"
      title="Documents"
      titleId="project-documents-title"
    >
      <form className="jixia-toolbar" onSubmit={handleCreateDocument}>
        <Field label="New project document" style={{ flex: "1 1 300px" }}>
          <input
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="e.g. Shared literature synthesis"
            required
            type="text"
            value={title}
          />
        </Field>
        <Button disabled={createState === "submitting"} type="submit" variant="primary">
          {createState === "submitting" ? "Creating…" : "Create"}
        </Button>
      </form>

      {createError ? (
        <Notice role="alert" tone="danger">
          {createError}
        </Notice>
      ) : null}

      {loadState === "loading" ? <p className="jixia-description">Loading server-authorized documents…</p> : null}
      {loadState === "error" && loadMessage ? (
        <Notice role="status" tone="warning">
          {loadMessage}
        </Notice>
      ) : null}

      {documents.length > 0 ? (
        <div className="jixia-list">
          {documents.map((document) => (
            <ListRow
              actions={<Pill tone={document.status === "active" ? "success" : "warning"}>{document.status}</Pill>}
              key={document.id}
              meta={`Revision ${document.revisionNumber} · Updated ${formatDate(document.updatedAt)}`}
              onOpen={() => onOpenDocument(document.id)}
              title={document.title}
            />
          ))}
        </div>
      ) : loadState !== "loading" ? (
        <EmptyState
          description="Document rows render only from API responses; creating one submits project-scoped intent to the server."
          title="No project documents are available from the API response yet"
        />
      ) : null}
    </Pane>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
