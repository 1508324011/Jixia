import type {
  DocumentDTO,
  DocumentDraftDTO,
  DocumentRevisionDTO,
  EditorSnapshot,
  SaveDocumentDraftRequest,
  SaveDocumentRevisionConflictResponse,
  SaveDocumentRevisionRequest,
  SaveDocumentRevisionResponse
} from "@jixia/shared";
import { currentEditorSchemaVersion, emptyEditorSnapshot } from "@jixia/shared";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api";
import {
  ArtifactCanvas,
  Button,
  Inspector,
  Notice,
  Panel,
  Pill,
  StatusStrip as WorkbenchStatusStrip,
  SurfaceHeader,
  WorkbenchSurface,
  WorkspaceFrame,
  WorkspaceMainSplit
} from "../layout/workbench";
import { DocumentCopilotPanel } from "./DocumentCopilotPanel";
import { JixiaEditor, type JixiaEditorHandle } from "./editor/JixiaEditor";

type DocumentEditorPageProps = {
  readonly backLabel?: string;
  readonly documentId: string;
  readonly onBack?: () => void;
  readonly onOpenAISettings?: () => void;
};

type ReadDocumentResponse = {
  readonly document: DocumentDTO;
  readonly revision: DocumentRevisionDTO | null;
  readonly currentSnapshot: EditorSnapshot;
};

type AcceptedRevisionResponse = SaveDocumentRevisionResponse | { readonly error: string };

export function DocumentEditorPage({ backLabel = "Projects", documentId, onBack, onOpenAISettings }: DocumentEditorPageProps) {
  const editorRef = useRef<JixiaEditorHandle | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [document, setDocument] = useState<DocumentDTO | null>(null);
  const [title, setTitle] = useState("");
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(emptyEditorSnapshot);
  const [baseRevision, setBaseRevision] = useState(0);
  const [draftStatus, setDraftStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle"
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "conflict" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<SaveDocumentRevisionConflictResponse | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadDocument(): Promise<void> {
      setLoadState("loading");
      setErrorMessage(null);
      setConflict(null);
      setIsDirty(false);

      try {
        const response = await apiFetch<ReadDocumentResponse>(`/documents/${encodeURIComponent(documentId)}`);
        if (isCancelled) {
          return;
        }

        setDocument(response.document);
        setTitle(response.document.title);
        setSnapshot(response.currentSnapshot);
        setBaseRevision(response.document.revisionNumber);
        setLoadState("ready");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setLoadState("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to load document.");
      }
    }

    void loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (!document || !isDirty || document.status !== "active") {
      return;
    }

    setDraftStatus("pending");
    const timeoutId = window.setTimeout(() => {
      const draftContent = editorRef.current?.exportSnapshot() ?? snapshot;
      const payload: SaveDocumentDraftRequest = {
        documentId: document.id,
        baseRevision,
        draftContent
      };

      setDraftStatus("saving");
      apiFetch<{ readonly draft: DocumentDraftDTO }>(`/documents/${encodeURIComponent(document.id)}/draft`, {
        method: "PUT",
        json: payload
      })
        .then((response) => {
          setDraftSavedAt(response.draft.updatedAt);
          setDraftStatus("saved");
        })
        .catch((error: unknown) => {
          setDraftStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Unable to save draft.");
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [baseRevision, document, isDirty, snapshot]);

  function handleSnapshotChange(nextSnapshot: EditorSnapshot): void {
    setSnapshot(nextSnapshot);
    setIsDirty(true);
    setSaveStatus("idle");
    setConflict(null);
  }

  async function handleFormalSave(): Promise<void> {
    if (!document) {
      return;
    }

    setSaveStatus("saving");
    setErrorMessage(null);
    setConflict(null);
    const contentSnapshot = editorRef.current?.exportSnapshot() ?? snapshot;

    const payload: SaveDocumentRevisionRequest = {
      documentId: document.id,
      baseRevision,
      contentSnapshot,
      title
    };

    try {
      const response = await apiFetch<AcceptedRevisionResponse>(
        `/documents/${encodeURIComponent(document.id)}/revisions`,
        {
          method: "POST",
          json: payload,
          acceptedStatuses: [409]
        }
      );

      if (isConflictResponse(response)) {
        setConflict(response);
        setSaveStatus("conflict");
        return;
      }

      if (!isSavedResponse(response)) {
        setSaveStatus("error");
        setErrorMessage("Unable to save revision.");
        return;
      }

      setDocument(response.document);
      setTitle(response.document.title);
      setSnapshot(response.revision.contentSnapshot);
      setBaseRevision(response.revision.revisionNumber);
      setIsDirty(false);
      setDraftStatus("idle");
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to save revision.");
    }
  }

  if (loadState === "loading") {
    return (
      <WorkbenchSurface aria-label="Document editor loading">
        <p className="jixia-description">Loading server-authorized document…</p>
      </WorkbenchSurface>
    );
  }

  if (loadState === "error" || !document) {
    return (
      <WorkbenchSurface aria-labelledby="document-error-title">
        <SurfaceHeader title="Document unavailable" titleId="document-error-title" />
        {errorMessage ? (
          <Notice role="alert" tone="danger">
            {errorMessage}
          </Notice>
        ) : null}
        {onBack ? (
          <Button onClick={onBack}>
            Back to {backLabel}
          </Button>
        ) : null}
      </WorkbenchSurface>
    );
  }

  const readOnly = document.status !== "active";

  return (
    <WorkbenchSurface aria-labelledby="document-editor-title" width="full">
      <WorkspaceFrame aria-label="Document workbench">
        <SurfaceHeader
          actions={
            <div style={metaClusterStyle}>
              <Pill tone={document.status === "active" ? "success" : "warning"}>{document.status}</Pill>
              <Pill>Base revision {baseRevision}</Pill>
              <Button disabled={saveStatus === "saving" || readOnly} onClick={handleFormalSave} variant="primary">
                {saveStatus === "saving" ? "Saving…" : "Save revision"}
              </Button>
            </div>
          }
          breadcrumbs={
            <>
              {onBack ? (
                <Button onClick={onBack} variant="link">
                  {backLabel}
                </Button>
              ) : null}
              <span>/</span>
              <span>Document editor</span>
            </>
          }
          description="Draft autosave writes only to the draft endpoint. Formal save creates revisions with the current base revision."
          eyebrow="Document workspace"
          title={
            <label className="jixia-document-title-field">
              <input
                aria-label="Document title"
                className="jixia-document-title-input"
                disabled={readOnly}
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                  setIsDirty(true);
                }}
                value={title}
              />
            </label>
          }
          titleId="document-editor-title"
        />

        <StatusStrip
          draftSavedAt={draftSavedAt}
          draftStatus={draftStatus}
          hasConflict={Boolean(conflict)}
          readOnly={readOnly}
          saveStatus={saveStatus}
        />

        {errorMessage || conflict ? (
          <div className="jixia-workspace-frame__messages">
            {errorMessage ? (
              <Notice role="alert" tone="danger">
                {errorMessage}
              </Notice>
            ) : null}
            {conflict ? <ConflictView conflict={conflict} /> : null}
          </div>
        ) : null}

        <WorkspaceMainSplit className="jixia-editor-workbench" inspectorWidth="minmax(520px, 38vw)">
          <ArtifactCanvas aria-label="Document artifact canvas">
            <JixiaEditor
              ref={editorRef}
              documentId={document.id}
              documentVersionKey={`${document.id}:${baseRevision}:${document.currentRevisionId ?? "draft"}`}
              onChange={handleSnapshotChange}
              readOnly={readOnly}
              value={snapshot}
            />
          </ArtifactCanvas>
          <Inspector activeMode="copilot" aria-label="Document inspector">
            <DocumentCopilotPanel
              baseRevision={baseRevision}
              document={document}
              exportSnapshot={() => editorRef.current?.exportSnapshot() ?? snapshot}
              readOnly={readOnly}
              snapshot={snapshot}
              title={title}
              {...(onOpenAISettings ? { onOpenSettings: onOpenAISettings } : {})}
            />
          </Inspector>
        </WorkspaceMainSplit>
      </WorkspaceFrame>
    </WorkbenchSurface>
  );
}

type StatusStripProps = {
  readonly draftSavedAt: string | null;
  readonly draftStatus: "idle" | "pending" | "saving" | "saved" | "error";
  readonly hasConflict: boolean;
  readonly readOnly: boolean;
  readonly saveStatus: "idle" | "saving" | "saved" | "conflict" | "error";
};

function StatusStrip({ draftSavedAt, draftStatus, hasConflict, readOnly, saveStatus }: StatusStripProps) {
  const draftCopy = readOnly
    ? "Archived documents are read-only."
    : draftStatus === "saved"
      ? `Draft saved${draftSavedAt ? ` at ${formatTimestamp(draftSavedAt)}` : ""}.`
      : draftStatus === "saving"
        ? "Saving draft…"
        : draftStatus === "pending"
          ? "Draft save pending…"
          : draftStatus === "error"
            ? "Draft save failed."
            : "Draft autosave ready.";
  const saveCopy =
    saveStatus === "saved"
      ? "Formal revision saved."
      : saveStatus === "conflict"
        ? "Conflict returned by API. Manual review required."
        : saveStatus === "error"
          ? "Formal save failed."
          : "No formal revision saved yet.";

  return (
    <WorkbenchStatusStrip
      items={[
        draftCopy,
        saveCopy,
        hasConflict ? "Conflict visible: manual review only." : "Conflict state clear.",
        readOnly ? "Archived state: editor locked." : "Active document: editor writable.",
        "AI chat uses explicit context only; provider keys stay server-owned."
      ]}
    />
  );
}

type ConflictViewProps = {
  readonly conflict: SaveDocumentRevisionConflictResponse;
};

function ConflictView({ conflict }: ConflictViewProps) {
  return (
    <Panel aria-labelledby="save-conflict-title" eyebrow="Human merge required" muted title="Revision conflict" titleId="save-conflict-title">
      <p className="jixia-description" style={{ color: "#9a3412", margin: 0 }}>
        The server rejected this formal save because revision {conflict.currentRevisionNumber} exists while
        this editor submitted base revision {conflict.submittedBaseRevision}. Review both snapshots manually;
        Jixia does not call AI or auto-merge conflicts.
      </p>
      <div style={conflictGridStyle}>
        <SnapshotPreview label="Current server snapshot" snapshot={conflict.currentSnapshot} />
        <SnapshotPreview label="Your submitted snapshot" snapshot={conflict.submittedSnapshot} />
      </div>
    </Panel>
  );
}

type SnapshotPreviewProps = {
  readonly label: string;
  readonly snapshot: EditorSnapshot;
};

function SnapshotPreview({ label, snapshot }: SnapshotPreviewProps) {
  return (
    <Panel muted>
      <h3 style={snapshotTitleStyle}>{label}</h3>
      <p className="jixia-description" style={{ color: "#9a3412", margin: 0 }}>
        Schema {snapshot.editorSchemaVersion ?? currentEditorSchemaVersion} · {snapshot.blocks.length} blocks
      </p>
      <pre style={preStyle}>{JSON.stringify(snapshot.blocks, null, 2)}</pre>
    </Panel>
  );
}

function isConflictResponse(response: AcceptedRevisionResponse): response is SaveDocumentRevisionConflictResponse {
  return "outcome" in response && response.outcome === "conflict";
}

function isSavedResponse(
  response: AcceptedRevisionResponse
): response is Extract<SaveDocumentRevisionResponse, { readonly outcome: "saved" }> {
  return "outcome" in response && response.outcome === "saved";
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

const metaClusterStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "flex-end"
} as const;

const conflictGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "12px"
};

const snapshotTitleStyle = {
  margin: 0,
  color: "#7c2d12",
  fontSize: "14px"
};

const preStyle = {
  maxHeight: "260px",
  overflow: "auto",
  border: "1px solid #ffedd5",
  borderRadius: "12px",
  background: "#ffffff",
  color: "#334155",
  fontSize: "12px",
  lineHeight: 1.45,
  margin: 0,
  padding: "10px",
  whiteSpace: "pre-wrap"
} as const;
