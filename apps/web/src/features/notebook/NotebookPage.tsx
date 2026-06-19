import type { DocumentDTO, ListDocumentsResponse } from "@jixia/shared";
import { useEffect, useState } from "react";

import { apiFetch } from "../../lib/api";
import { DocumentList } from "../documents/DocumentList";
import { SurfaceHeader, WorkbenchSurface } from "../layout/workbench";

type NotebookPageProps = {
  readonly onOpenDocument: (documentId: string) => void;
};

export function NotebookPage({ onOpenDocument }: NotebookPageProps) {
  const [documents, setDocuments] = useState<readonly DocumentDTO[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "error">("loading");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDocuments(): Promise<void> {
      setLoadState("loading");
      setLoadMessage(null);

      try {
        const response = await apiFetch<ListDocumentsResponse>("/documents/notebook");
        if (!isCancelled) {
          setDocuments(response.documents);
          setLoadState("idle");
        }
      } catch (error) {
        if (!isCancelled) {
          setDocuments([]);
          setLoadState("error");
          setLoadMessage(error instanceof Error ? error.message : "Unable to load notebook documents.");
        }
      }
    }

    void loadDocuments();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <WorkbenchSurface aria-labelledby="notebook-title" width="wide">
      <SurfaceHeader
        description="Notebook documents are returned by the API for the current owner only. Creating a note sends notebook-scoped intent to the same document service used by Project Docs."
        eyebrow="Personal synthesis"
        title="Notebook"
        titleId="notebook-title"
      />

      <DocumentList
        documents={documents}
        loadMessage={loadMessage}
        loadState={loadState}
        onDocumentsChanged={setDocuments}
        onOpenDocument={onOpenDocument}
        scope="notebook"
      />
    </WorkbenchSurface>
  );
}
