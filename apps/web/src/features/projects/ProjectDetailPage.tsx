import type { DocumentDTO, ProjectDTO } from "@jixia/shared";
import { useEffect, useState } from "react";

import { apiFetch } from "../../lib/api";
import { DocumentList } from "../documents/DocumentList";
import { Button, MetaGrid, Notice, SurfaceHeader, WorkbenchSurface } from "../layout/workbench";

type ProjectDetailPageProps = {
  readonly projectId: string;
  readonly onBack: () => void;
  readonly onOpenDocument: (documentId: string) => void;
};

type GetProjectResponse = {
  readonly project: ProjectDTO;
};

type ProjectDocumentsResponse = {
  readonly documents: readonly DocumentDTO[];
};

export function ProjectDetailPage({ projectId, onBack, onOpenDocument }: ProjectDetailPageProps) {
  const [project, setProject] = useState<ProjectDTO | null>(null);
  const [documents, setDocuments] = useState<readonly DocumentDTO[]>([]);
  const [projectState, setProjectState] = useState<"loading" | "ready" | "error">("loading");
  const [documentState, setDocumentState] = useState<"idle" | "loading" | "error">("loading");
  const [projectError, setProjectError] = useState<string | null>(null);
  const [documentMessage, setDocumentMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadProject(): Promise<void> {
      setProjectState("loading");
      setProjectError(null);

      try {
        const response = await apiFetch<GetProjectResponse>(`/projects/${encodeURIComponent(projectId)}`);
        if (!isCancelled) {
          setProject(response.project);
          setProjectState("ready");
        }
      } catch (error) {
        if (!isCancelled) {
          setProjectState("error");
          setProjectError(error instanceof Error ? error.message : "Unable to load project.");
        }
      }
    }

    async function loadDocuments(): Promise<void> {
      setDocumentState("loading");
      setDocumentMessage(null);

      try {
        const response = await apiFetch<ProjectDocumentsResponse>(
          `/projects/${encodeURIComponent(projectId)}/documents`
        );
        if (!isCancelled) {
          setDocuments(response.documents);
          setDocumentState("idle");
        }
      } catch (error) {
        if (!isCancelled) {
          setDocuments([]);
          setDocumentState("error");
          setDocumentMessage(
            error instanceof Error
              ? `${error.message} Project document listing is not available in the current API; create a document here or open one after creation.`
              : "Project document listing is not available in the current API."
          );
        }
      }
    }

    void loadProject();
    void loadDocuments();

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  if (projectState === "loading") {
    return (
      <WorkbenchSurface aria-label="Project loading">
        <p className="jixia-description">Loading project…</p>
      </WorkbenchSurface>
    );
  }

  if (projectState === "error" || !project) {
    return (
      <WorkbenchSurface aria-labelledby="project-error-title">
        <SurfaceHeader
          actions={<Button onClick={onBack}>Back to projects</Button>}
          eyebrow="Project workspace"
          title="Project unavailable"
          titleId="project-error-title"
        />
        {projectError ? (
          <Notice role="alert" tone="danger">
            {projectError}
          </Notice>
        ) : null}
      </WorkbenchSurface>
    );
  }

  return (
    <WorkbenchSurface aria-labelledby="project-title" width="wide">
      <SurfaceHeader
        actions={<Button onClick={onBack}>← Projects</Button>}
        description="Project details come from the API. The browser shows the metadata it receives and submits document actions back to server-owned routes."
        eyebrow="Project workspace"
        meta={
          <MetaGrid
            items={[
              { label: "Project ID", value: project.id },
              { label: "Created", value: formatDate(project.createdAt) },
              { label: "Updated", value: formatDate(project.updatedAt) }
            ]}
          />
        }
        title={project.name}
        titleId="project-title"
      />

      <DocumentList
        documents={documents}
        loadMessage={documentMessage}
        loadState={documentState}
        onDocumentsChanged={setDocuments}
        onOpenDocument={onOpenDocument}
        projectId={project.id}
      />
    </WorkbenchSurface>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}
