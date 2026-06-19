import type {
  CreateDocumentResponse,
  CreateNotebookDocumentRequest,
  CreateProjectDocumentRequest,
  DocumentDTO
} from "@jixia/shared";
import type { FormEvent } from "react";
import { useState } from "react";

import { apiFetch } from "../../lib/api";
import { Button, EmptyState, Field, ListRow, Notice, Pane, Pill } from "../layout/workbench";

type DocumentScopeProps =
  | {
      readonly scope: "notebook";
    }
  | {
      readonly projectId: string;
      readonly scope: "project";
    };

type DocumentListProps = {
  readonly documents: readonly DocumentDTO[];
  readonly loadState?: "idle" | "loading" | "error";
  readonly loadMessage?: string | null;
  readonly onDocumentsChanged?: (documents: readonly DocumentDTO[]) => void;
  readonly onOpenDocument: (documentId: string) => void;
} & DocumentScopeProps;

export function DocumentList({
  documents,
  loadState = "idle",
  loadMessage,
  onDocumentsChanged,
  onOpenDocument,
  ...scopeProps
}: DocumentListProps) {
  const [title, setTitle] = useState("");
  const [createState, setCreateState] = useState<"idle" | "submitting" | "error">("idle");
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreateDocument(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateState("submitting");
    setCreateError(null);

    const payload = createDocumentPayload(scopeProps, title);
    const path = scopeProps.scope === "project" ? "/documents/project" : "/documents/notebook";

    try {
      const response = await apiFetch<CreateDocumentResponse>(path, {
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
      aria-labelledby={`${scopeProps.scope}-documents-title`}
      eyebrow={scopeProps.scope === "project" ? "Project Docs" : "Notebook"}
      title="Documents"
      titleId={`${scopeProps.scope}-documents-title`}
    >
      <form className="jixia-toolbar" onSubmit={handleCreateDocument}>
        <Field label={scopeProps.scope === "project" ? "New project document" : "New notebook document"} style={{ flex: "1 1 300px" }}>
          <input
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder={scopeProps.scope === "project" ? "e.g. Shared literature synthesis" : "e.g. Personal synthesis note"}
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
          description={scopeProps.scope === "project" ? "Document rows render only from API responses; creating one submits project-scoped intent to the server." : "Document rows render only from API responses; creating one submits notebook-scoped intent to the server."}
          title={scopeProps.scope === "project" ? "No project documents returned by the API yet" : "No notebook documents returned by the API yet"}
        />
      ) : null}
    </Pane>
  );
}

function createDocumentPayload(scopeProps: DocumentScopeProps, title: string): CreateProjectDocumentRequest | CreateNotebookDocumentRequest {
  if (scopeProps.scope === "project") {
    return {
      projectId: scopeProps.projectId,
      title
    };
  }

  return { title };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
