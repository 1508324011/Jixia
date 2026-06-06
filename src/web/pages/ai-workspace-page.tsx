import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type {
  AiContextPackDetail,
  AiContextPackRecord,
  AiContextSourceRef,
  AiWorkspaceSessionRecord,
} from "@shared/contracts/ai-workspace";
import type { JobRecord } from "@shared/contracts/jobs";
import type { ScopeRef } from "@shared/contracts/projects";

import {
  GovernedJobListPanel,
  JobLifecyclePanel,
} from "../components/job-runtime-panels";
import { apiClient } from "../lib/http-client";
import { type JobsWorkbenchScope, useJobsPresenter } from "../presenters/jobs-presenter";

type ContextSourceFormType = AiContextSourceRef["sourceType"];

function scopeToRef(scope: JobsWorkbenchScope): ScopeRef {
  return scope.type === "project"
    ? { id: scope.id, type: "project" }
    : { id: scope.id, type: "user" };
}

function canMutateScope(scope: JobsWorkbenchScope | null): boolean {
  if (!scope) {
    return false;
  }

  return scope.type === "user" || scope.role === "owner" || scope.role === "editor";
}

function buildContextSourceRef(input: {
  libraryEntryId: string;
  primaryId: string;
  projectDocId: string;
  sourceType: ContextSourceFormType;
  versionId: string;
}): AiContextSourceRef {
  switch (input.sourceType) {
    case "generatedInsight":
      return {
        generatedInsightId: input.primaryId.trim(),
        libraryEntryId: input.libraryEntryId.trim(),
        sourceType: "generatedInsight",
      };
    case "projectDocCitation":
      return {
        citationId: input.primaryId.trim(),
        projectDocId: input.projectDocId.trim(),
        projectDocVersionId: input.versionId.trim() || undefined,
        sourceType: "projectDocCitation",
      };
    case "projectDocVersion":
      return {
        projectDocId: input.projectDocId.trim(),
        projectDocVersionId: input.versionId.trim(),
        sourceType: "projectDocVersion",
      };
    case "projectLibraryEntry":
      return {
        libraryEntryId: input.primaryId.trim(),
        sourceType: "projectLibraryEntry",
      };
    case "readerExcerpt":
      return {
        readerExcerptId: input.primaryId.trim(),
        sourceType: "readerExcerpt",
      };
  }
}

function contextSourceLabel(source: AiContextSourceRef): string {
  switch (source.sourceType) {
    case "generatedInsight":
      return `Generated insight · ${source.generatedInsightId} · library ${source.libraryEntryId}`;
    case "projectDocCitation":
      return `Project Doc citation · ${source.citationId} · document ${source.projectDocId}`;
    case "projectDocVersion":
      return `Project Doc version · ${source.projectDocVersionId} · document ${source.projectDocId}`;
    case "projectLibraryEntry":
      return `Project Library entry · ${source.libraryEntryId}`;
    case "readerExcerpt":
      return `Reader excerpt · ${source.readerExcerptId}`;
  }
}

function createJobRuntimeHref(
  job: JobRecord | null,
  selectedScope: JobsWorkbenchScope | null,
): string {
  const params = new URLSearchParams();

  if (job) {
    params.set("jobId", job.id);
    params.set("scopeId", job.scope.id);
    params.set("scopeType", job.scope.type);
  } else if (selectedScope) {
    params.set("scopeId", selectedScope.id);
    params.set("scopeType", selectedScope.type);
  }

  const query = params.toString();

  return query ? `/jobs?${query}` : "/jobs";
}

export function AiWorkspacePage() {
  const {
    activeJob,
    audits,
    availableScopes,
    cancelActiveJob,
    canCancelActiveJob,
    canCreateJob,
    credentials,
    error,
    events,
    isLoading,
    isRunningJob,
    jobs,
    projects,
    refresh,
    selectedCredentialRef,
    selectedJobId,
    selectedScope,
    selectedScopeKey,
    selectedUserSpaceId,
    setSelectedCredentialRef,
    setSelectedJobId,
    setSelectedScopeKey,
    setSelectedUserSpaceId,
    setupRequired,
    spaces,
  } = useJobsPresenter();

  const selectedCredential = credentials.find((credential) =>
    credential.credentialRef === selectedCredentialRef
  ) ?? null;
  const [aiSessions, setAiSessions] = useState<AiWorkspaceSessionRecord[]>([]);
  const [aiContextPacks, setAiContextPacks] = useState<AiContextPackRecord[]>([]);
  const [selectedAiSessionId, setSelectedAiSessionId] = useState("");
  const [selectedAiContextPackId, setSelectedAiContextPackId] = useState("");
  const [contextPackDetail, setContextPackDetail] = useState<AiContextPackDetail | null>(null);
  const [aiWorkspaceError, setAiWorkspaceError] = useState<string | null>(null);
  const [isAiWorkspaceBusy, setIsAiWorkspaceBusy] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState("Focused review session");
  const [newContextPackTitle, setNewContextPackTitle] = useState("Selected evidence pack");
  const [contextSourceType, setContextSourceType] = useState<ContextSourceFormType>("projectLibraryEntry");
  const [contextSourcePrimaryId, setContextSourcePrimaryId] = useState("");
  const [contextSourceProjectDocId, setContextSourceProjectDocId] = useState("");
  const [contextSourceVersionId, setContextSourceVersionId] = useState("");
  const [contextSourceLibraryEntryId, setContextSourceLibraryEntryId] = useState("");
  const [contextPackInstruction, setContextPackInstruction] = useState(
    "Synthesize these authorized source references for the current workspace.",
  );
  const projectScopeCount = availableScopes.filter((scope) => scope.type === "project").length;
  const selectedAiSession = aiSessions.find((session) =>
    session.id === selectedAiSessionId
  ) ?? null;
  const selectedAiContextPack = aiContextPacks.find((pack) =>
    pack.id === selectedAiContextPackId
  ) ?? null;
  const canMutateAiWorkspace = canMutateScope(selectedScope);
  const selectedContextItemCount = contextPackDetail?.items.length ?? selectedAiContextPack?.itemCount ?? 0;
  const canLaunchContextPackJob = Boolean(
    selectedCredentialRef &&
      selectedScope &&
      selectedAiContextPackId &&
      selectedContextItemCount > 0 &&
      canMutateAiWorkspace,
  );
  const scopeOptions = selectedScopeKey.startsWith("project:") && !selectedScope
    ? [
        { label: "Unavailable project scope", value: selectedScopeKey },
        ...availableScopes.map((scope) => ({
          label: scope.label,
          value: `${scope.type}:${scope.id}`,
        })),
      ]
    : availableScopes.map((scope) => ({
        label: scope.label,
        value: `${scope.type}:${scope.id}`,
      }));
  const jobRuntimeHref = createJobRuntimeHref(activeJob, selectedScope);

  const loadAiWorkspaceSessions = useCallback(async () => {
    if (!selectedScope) {
      setAiSessions([]);
      setSelectedAiSessionId("");
      return;
    }

    const response = await apiClient.listAiWorkspaceSessions(scopeToRef(selectedScope));
    setAiSessions(response.sessions);
    setSelectedAiSessionId((currentSessionId) => {
      if (currentSessionId && response.sessions.some((session) => session.id === currentSessionId)) {
        return currentSessionId;
      }

      return response.sessions[0]?.id ?? "";
    });
  }, [selectedScope]);

  const loadAiContextPacks = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setAiContextPacks([]);
      setSelectedAiContextPackId("");
      return;
    }

    const response = await apiClient.listAiWorkspaceContextPacks(sessionId);
    setAiContextPacks(response.packs);
    setSelectedAiContextPackId((currentPackId) => {
      if (currentPackId && response.packs.some((pack) => pack.id === currentPackId)) {
        return currentPackId;
      }

      return response.packs[0]?.id ?? "";
    });
  }, []);

  const loadContextPackDetail = useCallback(async (contextPackId: string) => {
    if (!contextPackId) {
      setContextPackDetail(null);
      return;
    }

    setContextPackDetail(await apiClient.getAiWorkspaceContextPack(contextPackId));
  }, []);

  useEffect(() => {
    setAiWorkspaceError(null);
    setAiContextPacks([]);
    setSelectedAiContextPackId("");
    setContextPackDetail(null);

    if (!selectedScope) {
      setAiSessions([]);
      setSelectedAiSessionId("");
      return;
    }

    void loadAiWorkspaceSessions().catch((workspaceError) => {
      setAiSessions([]);
      setSelectedAiSessionId("");
      setAiWorkspaceError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to load AI Workspace sessions.",
      );
    });
  }, [loadAiWorkspaceSessions, selectedScope]);

  useEffect(() => {
    setContextPackDetail(null);

    void loadAiContextPacks(selectedAiSessionId).catch((workspaceError) => {
      setAiContextPacks([]);
      setSelectedAiContextPackId("");
      setAiWorkspaceError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to load AI Workspace context packs.",
      );
    });
  }, [loadAiContextPacks, selectedAiSessionId]);

  useEffect(() => {
    void loadContextPackDetail(selectedAiContextPackId).catch((workspaceError) => {
      setContextPackDetail(null);
      setAiWorkspaceError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to load AI Workspace context pack detail.",
      );
    });
  }, [loadContextPackDetail, selectedAiContextPackId]);

  const createAiWorkspaceSession = useCallback(async () => {
    if (!selectedScope) {
      setAiWorkspaceError("Choose a server-visible AI Workspace scope first.");
      return;
    }

    try {
      setIsAiWorkspaceBusy(true);
      setAiWorkspaceError(null);
      const session = await apiClient.createAiWorkspaceSession(
        scopeToRef(selectedScope),
        { title: newSessionTitle },
      );
      await loadAiWorkspaceSessions();
      setSelectedAiSessionId(session.id);
    } catch (workspaceError) {
      setAiWorkspaceError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to create AI Workspace session.",
      );
    } finally {
      setIsAiWorkspaceBusy(false);
    }
  }, [loadAiWorkspaceSessions, newSessionTitle, selectedScope]);

  const createAiContextPack = useCallback(async () => {
    if (!selectedAiSessionId) {
      setAiWorkspaceError("Create or choose a server-owned AI Workspace session first.");
      return;
    }

    try {
      setIsAiWorkspaceBusy(true);
      setAiWorkspaceError(null);
      const pack = await apiClient.createAiWorkspaceContextPack(
        selectedAiSessionId,
        { title: newContextPackTitle },
      );
      await loadAiContextPacks(selectedAiSessionId);
      setSelectedAiContextPackId(pack.id);
    } catch (workspaceError) {
      setAiWorkspaceError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to create AI Workspace context pack.",
      );
    } finally {
      setIsAiWorkspaceBusy(false);
    }
  }, [loadAiContextPacks, newContextPackTitle, selectedAiSessionId]);

  const addContextItem = useCallback(async () => {
    if (!selectedAiContextPackId) {
      setAiWorkspaceError("Create or choose a context pack first.");
      return;
    }

    try {
      setIsAiWorkspaceBusy(true);
      setAiWorkspaceError(null);
      const source = buildContextSourceRef({
        libraryEntryId: contextSourceLibraryEntryId,
        primaryId: contextSourcePrimaryId,
        projectDocId: contextSourceProjectDocId,
        sourceType: contextSourceType,
        versionId: contextSourceVersionId,
      });
      await apiClient.addAiWorkspaceContextItem(
        selectedAiContextPackId,
        { source },
      );
      await loadContextPackDetail(selectedAiContextPackId);
      if (selectedAiSessionId) {
        await loadAiContextPacks(selectedAiSessionId);
      }
    } catch (workspaceError) {
      setAiWorkspaceError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to attach AI Workspace context reference.",
      );
    } finally {
      setIsAiWorkspaceBusy(false);
    }
  }, [
    contextSourceLibraryEntryId,
    contextSourcePrimaryId,
    contextSourceProjectDocId,
    contextSourceType,
    contextSourceVersionId,
    loadContextPackDetail,
    loadAiContextPacks,
    selectedAiSessionId,
    selectedAiContextPackId,
  ]);

  const launchContextPackJob = useCallback(async () => {
    if (!selectedAiContextPackId || !selectedCredentialRef) {
      setAiWorkspaceError("Choose a context pack and credential before launching.");
      return;
    }

    try {
      setIsAiWorkspaceBusy(true);
      setAiWorkspaceError(null);
      const created = await apiClient.createAiWorkspaceJob({
        contextPackId: selectedAiContextPackId,
        credentialRef: selectedCredentialRef,
        instruction: contextPackInstruction,
      });

      await apiClient.runJob(created.job.id);
      await refresh(selectedScopeKey, created.job.id);
    } catch (workspaceError) {
      setAiWorkspaceError(
        workspaceError instanceof Error
          ? workspaceError.message
          : "Failed to launch AI Workspace context-pack job.",
      );
    } finally {
      setIsAiWorkspaceBusy(false);
    }
  }, [contextPackInstruction, refresh, selectedAiContextPackId, selectedCredentialRef, selectedScopeKey]);

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          AI Workspace · governed runs · explicit confirmation boundary
        </p>
        <h1 className="page-title">AI Workspace</h1>
        <p className="page-description">
          Use this secondary workspace for long-context review, cross-material
          aggregation, repeated follow-up, outlines, and planning. Work starts as
          server-authorized jobs with status, event replay, audit history, and
          cancellation; generated material remains a preview, draft, or
          suggestion until an explicit confirmation path saves it elsewhere.
        </p>
      </header>

      <section aria-label="AI Workspace boundary" className="context-bar">
        <span>Scope · {selectedScope?.label ?? "No server-visible AI scope"}</span>
        <span className="status-badge">{activeJob?.status ?? "idle"}</span>
        <span className="status-badge">not standalone chat</span>
        <span className="status-badge">no direct durable writes</span>
      </section>

      <section aria-label="AI Workspace controls" className="context-bar">
        <span>Governance spaces · {spaces.length}</span>
        <span>Project scopes · {projectScopeCount}</span>
        <span>Credentials · {credentials.length}</span>
        <span>Governed runs · {jobs.length}</span>
        <label>
          Scope
          <select
            aria-label="AI Workspace scope"
            value={selectedScopeKey}
            onChange={(event) => setSelectedScopeKey(event.target.value)}
          >
            {scopeOptions.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </select>
        </label>
        {selectedScope?.type === "user" ? (
          <label>
            Governance space
            <select
              aria-label="AI Workspace governance space"
              value={selectedUserSpaceId}
              onChange={(event) => setSelectedUserSpaceId(event.target.value)}
              disabled={spaces.length === 0}
            >
              <option value="">Select a visible space</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} · {space.kind}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Credential
          <select
            aria-label="AI Workspace credential"
            value={selectedCredentialRef}
            onChange={(event) => setSelectedCredentialRef(event.target.value)}
            disabled={credentials.length === 0}
          >
            {credentials.length === 0 ? (
              <option value="">No credential configured</option>
            ) : (
              credentials.map((credential) => (
                <option key={credential.credentialRef} value={credential.credentialRef}>
                  {credential.provider} · {credential.credentialRef}
                </option>
              ))
            )}
          </select>
        </label>
        <button
          className="panel-link"
          type="button"
          onClick={() => void launchContextPackJob()}
          disabled={
            isAiWorkspaceBusy ||
            isRunningJob ||
            isLoading ||
            !canCreateJob ||
            !canLaunchContextPackJob ||
            setupRequired === "credential" ||
            setupRequired === "project"
          }
        >
          {isAiWorkspaceBusy || isRunningJob
            ? "Launching context-pack AI run…"
            : "Launch context-pack AI run"}
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void cancelActiveJob()}
          disabled={isRunningJob || isLoading || !canCancelActiveJob}
        >
          Cancel active run
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
        <Link className="panel-link" to="/settings">
          Open Settings
        </Link>
        <Link className="panel-link" to={jobRuntimeHref}>
          Open Jobs runtime
        </Link>
      </section>

      <section className="panel-grid" aria-label="AI Workspace context packs">
        <article className="panel">
          <h2 className="panel-title">Server-owned AI sessions</h2>
          <p className="quiet-copy">
            Sessions are scoped on the server. Personal sessions are owner-only;
            project sessions are visible through persisted ProjectMember access.
          </p>
          <label>
            New session title
            <input
              aria-label="AI Workspace session title"
              value={newSessionTitle}
              onChange={(event) => setNewSessionTitle(event.target.value)}
              placeholder="Focused review session"
            />
          </label>
          <button
            className="panel-link"
            type="button"
            onClick={() => void createAiWorkspaceSession()}
            disabled={!selectedScope || !canMutateAiWorkspace || isAiWorkspaceBusy}
          >
            Create server-owned session
          </button>
          <label>
            AI session
            <select
              aria-label="AI Workspace session"
              value={selectedAiSessionId}
              onChange={(event) => setSelectedAiSessionId(event.target.value)}
              disabled={aiSessions.length === 0}
            >
              {aiSessions.length === 0 ? (
                <option value="">No AI sessions yet</option>
              ) : (
                aiSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} · {session.scope.type}:{session.scope.id}
                  </option>
                ))
              )}
            </select>
          </label>
          {selectedAiSession ? (
            <p className="quiet-copy">
              Selected session ref: {selectedAiSession.id} · scope {selectedAiSession.scope.type}:{selectedAiSession.scope.id}
            </p>
          ) : null}
        </article>

        <article className="panel">
          <h2 className="panel-title">Context packs inherit session scope</h2>
          <p className="quiet-copy">
            Packs hold authorized source references only. The browser cannot send
            copied context text, private Notebook bodies, storage keys, or checksums.
          </p>
          <label>
            New context pack title
            <input
              aria-label="AI Workspace context pack title"
              value={newContextPackTitle}
              onChange={(event) => setNewContextPackTitle(event.target.value)}
              placeholder="Selected evidence pack"
            />
          </label>
          <button
            className="panel-link"
            type="button"
            onClick={() => void createAiContextPack()}
            disabled={!selectedAiSessionId || !canMutateAiWorkspace || isAiWorkspaceBusy}
          >
            Create context pack
          </button>
          <label>
            Context pack
            <select
              aria-label="AI Workspace context pack"
              value={selectedAiContextPackId}
              onChange={(event) => setSelectedAiContextPackId(event.target.value)}
              disabled={aiContextPacks.length === 0}
            >
              {aiContextPacks.length === 0 ? (
                <option value="">No context packs yet</option>
              ) : (
                aiContextPacks.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.title} · {pack.itemCount} refs
                  </option>
                ))
              )}
            </select>
          </label>
          <p className="quiet-copy">
            Context refs in selected pack: {selectedContextItemCount}
          </p>
        </article>
      </section>

      <section className="panel-grid" aria-label="AI Workspace context references">
        <article className="panel">
          <h2 className="panel-title">Attach authorized source reference</h2>
          <p className="quiet-copy">
            Choose one server-authorized object. The form collects IDs only; the
            server re-checks source visibility before storing or using the ref.
          </p>
          <label>
            Source type
            <select
              aria-label="AI Workspace context source type"
              value={contextSourceType}
              onChange={(event) => setContextSourceType(event.target.value as ContextSourceFormType)}
            >
              <option value="projectLibraryEntry">Project Library entry</option>
              <option value="readerExcerpt">Reader excerpt</option>
              <option value="generatedInsight">Generated insight</option>
              <option value="projectDocVersion">Project Doc version</option>
              <option value="projectDocCitation">Project Doc citation</option>
            </select>
          </label>
          {contextSourceType === "projectDocVersion" || contextSourceType === "projectDocCitation" ? (
            <label>
              Project Doc id
              <input
                aria-label="AI Workspace source project doc id"
                value={contextSourceProjectDocId}
                onChange={(event) => setContextSourceProjectDocId(event.target.value)}
                placeholder="project-doc-..."
              />
            </label>
          ) : null}
          {contextSourceType === "projectDocVersion" || contextSourceType === "projectDocCitation" ? (
            <label>
              Project Doc version id
              <input
                aria-label="AI Workspace source project doc version id"
                value={contextSourceVersionId}
                onChange={(event) => setContextSourceVersionId(event.target.value)}
                placeholder="project-doc-version-..."
              />
            </label>
          ) : null}
          {contextSourceType === "generatedInsight" ? (
            <label>
              Source library entry id
              <input
                aria-label="AI Workspace source library entry id"
                value={contextSourceLibraryEntryId}
                onChange={(event) => setContextSourceLibraryEntryId(event.target.value)}
                placeholder="library-entry-..."
              />
            </label>
          ) : null}
          {contextSourceType !== "projectDocVersion" ? (
            <label>
              {contextSourceType === "generatedInsight"
                ? "Generated insight id"
                : contextSourceType === "projectDocCitation"
                  ? "Project Doc citation id"
                  : contextSourceType === "readerExcerpt"
                    ? "Reader excerpt id"
                    : "Library entry id"}
              <input
                aria-label="AI Workspace source primary id"
                value={contextSourcePrimaryId}
                onChange={(event) => setContextSourcePrimaryId(event.target.value)}
                placeholder="source-id"
              />
            </label>
          ) : null}
          <button
            className="panel-link"
            type="button"
            onClick={() => void addContextItem()}
            disabled={!selectedAiContextPackId || !canMutateAiWorkspace || isAiWorkspaceBusy}
          >
            Attach source ref
          </button>
        </article>

        <article className="panel">
          <h2 className="panel-title">Launch from context-pack refs</h2>
          <p className="quiet-copy">
            Job payloads receive context refs, not raw browser-assembled context.
            Outputs remain preview material until another explicit product flow saves them.
          </p>
          <label>
            Run instruction
            <textarea
              aria-label="AI Workspace context-pack instruction"
              value={contextPackInstruction}
              onChange={(event) => setContextPackInstruction(event.target.value)}
              placeholder="Synthesize these authorized source references."
            />
          </label>
          <button
            className="panel-link"
            type="button"
            onClick={() => void launchContextPackJob()}
            disabled={!canLaunchContextPackJob || isAiWorkspaceBusy || isRunningJob}
          >
            Launch context-pack AI job
          </button>
          {contextPackDetail?.items.length ? (
            <ul>
              {contextPackDetail.items.map((item) => (
                <li key={item.id}>{contextSourceLabel(item.source)}</li>
              ))}
            </ul>
          ) : (
            <p className="quiet-copy">No authorized context refs have been attached yet.</p>
          )}
        </article>
      </section>

      {setupRequired === "credential" ? (
        <section className="panel-grid" aria-label="AI Workspace credential setup state">
          <article className="panel">
            <h2 className="panel-title">Credential setup required</h2>
            <p className="quiet-copy">
              Configure a provider credential in Settings before launching a
              governed AI run. AI Workspace uses credential references only and
              never asks for or displays raw provider keys.
            </p>
            <Link className="panel-link" to="/settings">
              Configure credentials in Settings
            </Link>
          </article>
        </section>
      ) : null}

      {setupRequired === "space" ? (
        <section className="panel-grid" aria-label="AI Workspace governance state">
          <article className="panel">
            <h2 className="panel-title">Governance space required</h2>
            <p className="quiet-copy">
              Personal AI Workspace runs require a real server-visible governance
              space selected by the user. The browser does not choose a fallback
              space or create one implicitly.
            </p>
          </article>
        </section>
      ) : null}

      {setupRequired === "project" ? (
        <section className="panel-grid" aria-label="AI Workspace unavailable project state">
          <article className="panel">
            <h2 className="panel-title">Project scope unavailable</h2>
            <p className="quiet-copy">
              The requested project scope is not visible to the current session.
              Choose a server-visible project scope or return to the personal
              lane before launching another governed run.
            </p>
          </article>
        </section>
      ) : null}

      {projects.length === 0 ? (
        <section className="panel-grid" aria-label="AI Workspace project state">
          <article className="panel">
            <h2 className="panel-title">No visible project scopes</h2>
            <p className="quiet-copy">
              Project-scoped AI work appears only when the server returns a
              project membership. AI Workspace does not fabricate project access
              from routes, spaces, or local fixtures.
            </p>
            <Link className="panel-link" to="/projects">
              Open Projects
            </Link>
          </article>
        </section>
      ) : null}

      {error ? (
        <section className="panel-grid" aria-label="AI Workspace errors">
          <article className="panel">
            <h2 className="panel-title">AI Workspace runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      {aiWorkspaceError ? (
        <section className="panel-grid" aria-label="AI Workspace context errors">
          <article className="panel">
            <h2 className="panel-title">AI Workspace context error</h2>
            <p className="quiet-copy">{aiWorkspaceError}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="AI Workspace layout">
        <GovernedJobListPanel
          emptyCopy="No governed AI runs exist yet for this scope. Launch a scoped run to populate server-authorized status, events, audits, and live recovery state."
          idLabel="Run id"
          jobs={jobs}
          selectedCredentialLabel="Selected credential reference"
          selectedCredentialRef={selectedCredential?.credentialRef ?? null}
          selectedJobId={selectedJobId}
          setSelectedJobId={setSelectedJobId}
          title="Governed AI runs"
        >
          <p className="quiet-copy">
            Run output shown here is treated as preview, draft, or suggestion
            material. Saving into Notebook, Project Docs, Library, projects, or
            settings must happen through a separate confirmed product flow.
          </p>
        </GovernedJobListPanel>

        <JobLifecyclePanel
          activeDescription="Status recovery and audit history come from the existing jobs runtime, not browser-owned transcript state."
          activeJob={activeJob}
          activeJobLabel="Focused run"
          audits={audits}
          auditEmptyCopy="Audit records appear after the server persists job creation, execution, cancellation, or failure activity."
          emptyCopy="Select or launch a governed AI run to inspect status, event replay, audit history, and cancellation availability."
          events={events}
          eventEmptyCopy="Waiting for replayed or live events. Refresh to recover persisted history for this run."
          title="Lifecycle, events, and audit trail"
        >
          <Link className="panel-link" to={jobRuntimeHref}>
            Open this run in Jobs
          </Link>
        </JobLifecyclePanel>
      </section>
    </main>
  );
}
