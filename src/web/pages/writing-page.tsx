import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { DocumentBlockDocument } from "@shared/contracts/document-content";
import type { CreateProjectDocAiSuggestionRequest } from "@shared/contracts/project-docs";
import type { ProjectDocCitationTraceRow } from "@shared/contracts/project-docs";

import { DocumentBlockEditor } from "../components/document-block-editor";
import { DocumentBlockRenderer } from "../components/document-block-renderer";
import { createLegacyTextProjection } from "../lib/document-blocks";
import { useProjectDocPresenter } from "../presenters/project-doc-presenter";

type ProjectDocSaveInput = Parameters<ReturnType<typeof useProjectDocPresenter>["save"]>[0];
type ProjectDocAiSuggestionInput = CreateProjectDocAiSuggestionRequest;

function createProjectDocAiSuggestionInput(
  input: ProjectDocAiSuggestionInput,
): ProjectDocAiSuggestionInput {
  return {
    citationIds: input.citationIds?.filter((citationId) => citationId.trim())
      .map((citationId) => citationId.trim()),
    credentialRef: input.credentialRef.trim(),
    instruction: input.instruction.trim(),
    selectedBlockId: input.selectedBlockId?.trim() || undefined,
    selectedText: input.selectedText,
  };
}

function readerExcerptSourceLabel(
  source: NonNullable<ProjectDocCitationTraceRow["readerExcerpt"]>["source"],
): string {
  switch (source) {
    case "reader_source":
      return "Reader excerpt";
    case "project_doc_snapshot":
      return "Project Doc snapshot evidence";
    case "project_library_asset":
      return "Project library citation span";
  }
}

function CitationTraceRow({ row }: { row: ProjectDocCitationTraceRow }) {
  return (
    <li className="stack-sm">
      <p className="quiet-copy">Citation · {row.citationId}</p>
      <p className="quiet-copy">Paper asset · {row.paperAssetId}</p>
      {row.paper ? (
        <>
          <p className="quiet-copy">Paper · {row.paper.title}</p>
          <p className="quiet-copy">Source · {row.paper.canonicalId}</p>
          <p className="quiet-copy">File available · {row.paper.hasFile ? "yes" : "no"}</p>
        </>
      ) : null}
      {row.projectLibraryEntry ? (
        <p className="quiet-copy">Project library entry · {row.projectLibraryEntry.libraryEntryId}</p>
      ) : null}
      {row.readerExcerpt ? (
        <>
          <p className="quiet-copy">Evidence source · {readerExcerptSourceLabel(row.readerExcerpt.source)}</p>
          <p className="quiet-copy">Reader excerpt · {row.readerExcerpt.id}</p>
          {row.readerExcerpt.locator ? (
            <p className="quiet-copy">Locator · {row.readerExcerpt.locator}</p>
          ) : null}
          {row.readerExcerpt.quote ? (
            <blockquote className="quiet-copy">{row.readerExcerpt.quote}</blockquote>
          ) : null}
        </>
      ) : row.evidenceSpan ? (
        <blockquote className="quiet-copy">{row.evidenceSpan}</blockquote>
      ) : null}
      {row.source.state === "adoption_needed" ? (
        <p className="quiet-copy">Citation source unavailable · {row.source.message}</p>
      ) : (
        <p className="quiet-copy">Citation source available in this project.</p>
      )}
    </li>
  );
}

function CitationTraceEmptyState({
  trace,
}: {
  trace: ReturnType<typeof useProjectDocPresenter>["citationTrace"];
}) {
  if (trace?.versionNumber === 0) {
    return (
      <p className="quiet-copy">
        No saved Project Doc version yet. Citation trace rows appear after the first server-confirmed Save draft.
      </p>
    );
  }

  return (
    <p className="quiet-copy">No citations in the latest saved Project Doc snapshot.</p>
  );
}

function AiSuggestionPanel({
  canEditProjectDoc,
  documentContent,
  onApply,
  onClear,
  onCreate,
  presenter,
}: {
  canEditProjectDoc: boolean;
  documentContent: DocumentBlockDocument;
  onApply(nextDocumentContent: DocumentBlockDocument): void;
  onClear(): void;
  onCreate(input: ProjectDocAiSuggestionInput): Promise<void>;
  presenter: ReturnType<typeof useProjectDocPresenter>;
}) {
  const [instruction, setInstruction] = useState("");
  const [credentialRef, setCredentialRef] = useState("");
  const [selectedBlockId, setSelectedBlockId] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [selectedCitationIds, setSelectedCitationIds] = useState<string[]>([]);
  const [applyStatus, setApplyStatus] = useState<string | null>(null);

  useEffect(() => {
    if (presenter.aiSuggestion) {
      setApplyStatus(null);
    }
  }, [presenter.aiSuggestion]);

  useEffect(() => {
    if (!presenter.citationTrace?.citations.length) {
      setSelectedCitationIds([]);
      return;
    }

    setSelectedCitationIds((current) => {
      const citations = presenter.citationTrace?.citations ?? [];
      const allowedIds = new Set(citations.map((row) => row.citationId));
      const nextSelection = current.filter((citationId) => allowedIds.has(citationId));

      return nextSelection.length > 0 ? nextSelection : citations.slice(0, 1).map((row) => row.citationId);
    });
  }, [presenter.citationTrace]);

  if (!canEditProjectDoc) {
    return (
      <section className="panel" aria-label="Evidence Copilot">
        <h3 className="panel-title">Evidence Copilot</h3>
        <p className="quiet-copy">
          Read-only view. Only project owners and editors can request AI suggestions for this Project Doc.
        </p>
      </section>
    );
  }

  const suggestion = presenter.aiSuggestion;

  async function handleCreateSuggestion(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    await onCreate(
      createProjectDocAiSuggestionInput({
        citationIds: selectedCitationIds.length > 0 ? selectedCitationIds : undefined,
        credentialRef,
        instruction,
        selectedBlockId: selectedBlockId || undefined,
        selectedText: selectedText || undefined,
      }),
    );
  }

  function handleApplySuggestion(): void {
    if (!suggestion?.suggestion) {
      return;
    }

    const nextDocumentContent = {
      ...documentContent,
      blocks: [...documentContent.blocks, suggestion.suggestion.block ?? {
        status: 'proposed',
        text: suggestion.suggestion.text,
        type: 'aiSuggestion',
      }],
    };

    onApply(nextDocumentContent);
    setApplyStatus('Suggestion applied to the local draft. Use Save draft to persist a new version.');
  }

  return (
    <section className="panel" aria-label="Evidence Copilot">
      <h3 className="panel-title">Evidence Copilot</h3>
      <p className="quiet-copy">
        Create a server-governed AI suggestion grounded in the latest saved Project Doc and citation trace.
      </p>

      <form className="stack-sm" onSubmit={(event) => void handleCreateSuggestion(event)}>
        <label className="document-block-editor__field">
          <span>Instruction</span>
          <textarea
            rows={4}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Refine the evidence summary into a concise discussion paragraph."
          />
        </label>

        <label className="document-block-editor__field">
          <span>Credential reference</span>
          <input
            value={credentialRef}
            onChange={(event) => setCredentialRef(event.target.value)}
            placeholder="credential-..."
          />
        </label>

        <label className="document-block-editor__field">
          <span>Selected block id (optional)</span>
          <input
            value={selectedBlockId}
            onChange={(event) => setSelectedBlockId(event.target.value)}
            placeholder="doc-block-1"
          />
        </label>

        <label className="document-block-editor__field">
          <span>Selected text (optional)</span>
          <textarea
            rows={3}
            value={selectedText}
            onChange={(event) => setSelectedText(event.target.value)}
            placeholder="Paste the local draft text the model should revise."
          />
        </label>

        <fieldset className="stack-sm">
          <legend className="quiet-copy">Project citation trace inputs</legend>
          {presenter.citationTrace?.citations.length ? (
            presenter.citationTrace.citations.map((row) => (
              <label key={row.citationId} className="document-block-editor__checkbox">
                <input
                  checked={selectedCitationIds.includes(row.citationId)}
                  type="checkbox"
                  onChange={(event) => {
                    setSelectedCitationIds((current) => (
                      event.target.checked
                        ? Array.from(new Set([...current, row.citationId]))
                        : current.filter((citationId) => citationId !== row.citationId)
                    ));
                  }}
                />
                <span>{row.citationId} · {row.paper?.title ?? row.paperAssetId}</span>
              </label>
            ))
          ) : (
            <p className="quiet-copy">No saved Project Doc citation trace rows are available yet.</p>
          )}
        </fieldset>

        <div className="button-row">
          <button
            type="submit"
            className="action-button"
            disabled={presenter.isCreatingAiSuggestion || !instruction.trim() || !credentialRef.trim()}
          >
            {presenter.isCreatingAiSuggestion ? 'Creating suggestion…' : 'Create AI suggestion'}
          </button>
          <button
            type="button"
            className="action-button action-button-secondary"
            disabled={!suggestion}
            onClick={() => {
              onClear();
              setApplyStatus(null);
            }}
          >
            Dismiss suggestion
          </button>
        </div>
      </form>

      {presenter.aiSuggestionError ? <p className="quiet-copy">{presenter.aiSuggestionError}</p> : null}
      {presenter.aiSuggestion?.job ? (
        <div className="stack-sm">
          <p className="quiet-copy">Job · {presenter.aiSuggestion.job.id}</p>
          <p className="quiet-copy">Status · {presenter.aiSuggestion.job.status}</p>
        </div>
      ) : null}
      {suggestion ? (
        <section className="stack-sm" aria-label="ai suggestion result">
          <h4 className="panel-title">Suggestion preview</h4>
          <DocumentBlockEditor
            disabled
            label="AI suggestion"
            showProjection={false}
            value={{
              blocks: [suggestion.suggestion?.block ?? {
                status: 'proposed',
                text: suggestion.suggestion?.text ?? '',
                type: 'aiSuggestion',
              }],
              schemaVersion: 1,
            }}
            onChange={() => undefined}
          />
          <p className="quiet-copy">{suggestion.suggestion?.rationale ?? 'Review the suggestion before applying it locally.'}</p>
          <div className="button-row">
            <button type="button" className="action-button" onClick={handleApplySuggestion}>
              Apply to local draft
            </button>
            <button type="button" className="action-button action-button-secondary" onClick={onClear}>
              Clear preview
            </button>
          </div>
          {applyStatus ? <p className="quiet-copy">{applyStatus}</p> : null}
        </section>
      ) : null}
    </section>
  );
}

export function WritingPage() {
  const { projectId = "", docId = "" } = useParams();
  const presenter = useProjectDocPresenter(projectId, docId);
  const [draftDocumentContent, setDraftDocumentContent] = useState<DocumentBlockDocument>(
    presenter.documentContent,
  );
  const [draftVersionId, setDraftVersionId] = useState<string | null>(
    presenter.snapshot?.versionId ?? null,
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [adoptionStatus, setAdoptionStatus] = useState<string | null>(null);
  const [isSavePendingLocally, setIsSavePendingLocally] = useState(false);
  const [isAdoptionPending, setIsAdoptionPending] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const draftDocumentContentRef = useRef(draftDocumentContent);
  const mutationLockRef = useRef<"save" | "reload" | null>(null);
  const snapshotVersionId = presenter.snapshot?.versionId ?? null;
  const isMutating =
    presenter.isSaving ||
    isSavePendingLocally ||
    isAdoptionPending ||
    isReloading ||
    mutationLockRef.current !== null;
  const isDraftHydrating = snapshotVersionId !== draftVersionId;
  const draftProjection = createLegacyTextProjection(draftDocumentContent);
  const canEditProjectDoc = presenter.project?.membership.role === "owner" || presenter.project?.membership.role === "editor";

  useEffect(() => {
    setDraftDocumentContent(presenter.documentContent);
    draftDocumentContentRef.current = presenter.documentContent;
    setDraftVersionId(snapshotVersionId);
  }, [presenter.documentContent, snapshotVersionId]);

  if (!projectId || !docId) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project Docs · shared knowledge center · citation traceability</p>
          <h1 className="page-title">Project Doc editor</h1>
          <p className="page-description">
            Select a visible project document before opening the shared Project Docs surface.
          </p>
        </header>

        <section className="panel-grid" aria-label="Project Docs route errors">
          <article className="panel">
            <h2 className="panel-title">Project document route missing</h2>
            <p className="quiet-copy">
              The canonical Project Docs editor route is `/projects/:projectId/writing/:docId` and cannot be fabricated in the browser.
            </p>
            <Link className="panel-link" to="/projects">
              Back to projects
            </Link>
          </article>
        </section>
      </main>
    );
  }

  async function handleSave(): Promise<void> {
    if (!presenter.document || mutationLockRef.current || !canEditProjectDoc) {
      return;
    }

    mutationLockRef.current = "save";
    setIsSavePendingLocally(true);
    setMutationError(null);
    setAdoptionStatus(null);

    try {
      await presenter.save(createProjectDocSaveInput());
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to save the Project Doc.",
      );
    } finally {
      mutationLockRef.current = null;
      setIsSavePendingLocally(false);
    }
  }

  function createProjectDocSaveInput(): ProjectDocSaveInput {
    return {
      citations: presenter.citations.map((citation) => ({
        evidenceSpan: citation.evidenceSpan,
        libraryEntryId: citation.libraryEntryId,
        paperAssetId: citation.paperAssetId,
        readerExcerptId: citation.readerExcerptId,
      })),
      documentContent: draftDocumentContentRef.current,
    };
  }

  async function handleAdoptCitationSourceAndRetry(): Promise<void> {
    const adoption = presenter.adoptionNeeded;

    if (!adoption?.sourceLibraryEntryId || mutationLockRef.current || !canEditProjectDoc) {
      return;
    }

    mutationLockRef.current = "save";
    setIsAdoptionPending(true);
    setMutationError(null);
    setAdoptionStatus(null);

    try {
      const adopted = await presenter.adoptCitationSource();

      if (!adopted) {
        setMutationError("Failed to adopt the citation source into the project library.");
        return;
      }

      setAdoptionStatus("Citation source adopted into the project library. Retrying the Project Doc save…");
      const saved = await presenter.save(createProjectDocSaveInput());

      if (!saved) {
        setMutationError("Citation source was adopted, but the Project Doc save still needs attention.");
        return;
      }

      setAdoptionStatus("Citation source adopted and Project Doc saved.");
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "Failed to adopt the citation source and retry the Project Doc save.",
      );
    } finally {
      mutationLockRef.current = null;
      setIsAdoptionPending(false);
    }
  }

  async function handleReload(): Promise<void> {
    if (mutationLockRef.current) {
      return;
    }

    mutationLockRef.current = "reload";
    setIsReloading(true);
    setMutationError(null);
    setAdoptionStatus(null);

    try {
      await presenter.refresh();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to reload the Project Doc.",
      );
    } finally {
      mutationLockRef.current = null;
      setIsReloading(false);
    }
  }

  const activeDocument = presenter.document;
  const publishStateLabel = activeDocument?.publishState ?? "draft";
  const contextDocumentId = activeDocument?.id ?? docId;
  const projectLabel = presenter.project?.project.name ?? projectId;
  const resolvedSpaceId = presenter.project?.project.spaceId ?? "No governance space";
  const adoptionNeeded = presenter.adoptionNeeded;
  const pageError = presenter.projectError ?? (adoptionNeeded ? null : presenter.error);

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Project Docs · shared knowledge center · citation traceability</p>
        <h1 className="page-title">Project Doc editor</h1>
        <p className="page-description">
          Maintain shared project background, evidence, rationale, conclusions, and formal drafts while keeping versions and citations server-owned.
        </p>
        <p className="quiet-copy">
          Reader evidence can inform this document only through explicit, project-scoped, citation-backed saves.
        </p>
        <p className="quiet-copy">
          Private Notebook drafts remain personal. Shared Project Docs use selected Reader evidence, project-visible citations, references, and explicit Project Library source adoption.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {resolvedSpaceId}</span>
        <span>Project context · {projectLabel} · {contextDocumentId}</span>
        <span className="status-badge">{publishStateLabel}</span>
        <span className="status-badge">{presenter.citations.length} citations</span>
        <span className="status-badge">governed citations</span>
      </section>

      {pageError ? (
        <section className="panel-grid" aria-label="Project Docs errors">
          <article className="panel">
            <h2 className="panel-title">Project Docs runtime error</h2>
            <p className="quiet-copy">{pageError}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="Project Docs layout">
        <article className="panel">
                {presenter.isProjectLoading || presenter.isLoading || isDraftHydrating ? (
                  <>
                    <h2 className="panel-title">Loading Project Doc…</h2>
                    <p className="quiet-copy">Pulling the latest saved project document from the server-owned project-doc runtime.</p>
                  </>
                ) : activeDocument && !pageError ? (
                  <div className="stack-sm">
                    <h2 className="panel-title">{activeDocument.title}</h2>
                    <p className="quiet-copy">
                      Project context · {projectLabel} · {contextDocumentId}
                    </p>
                    <p className="quiet-copy">
                      Latest snapshot · {presenter.snapshot?.capturedAt ?? "Not saved yet"}
                    </p>
                    {canEditProjectDoc ? (
                      <>
                        <DocumentBlockEditor
                          disabled={isMutating}
                          label="Draft content"
                          value={draftDocumentContent}
                          onChange={(nextDocumentContent) => {
                            draftDocumentContentRef.current = nextDocumentContent;
                            setDraftDocumentContent(nextDocumentContent);
                          }}
                        />
                        <div className="button-row">
                          <button
                            type="button"
                            className="action-button"
                            disabled={isMutating}
                            onClick={() => void handleSave()}
                          >
                            {presenter.isSaving || isSavePendingLocally ? "Saving draft…" : "Save draft"}
                          </button>
                          <button
                            type="button"
                            className="action-button action-button-secondary"
                            disabled={isMutating}
                            onClick={() => void handleReload()}
                          >
                            {isReloading ? "Reloading…" : "Reload draft"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <DocumentBlockRenderer
                          emptyState="This Project Doc does not have saved blocks yet."
                          label="Read-only Project Doc content"
                          value={draftDocumentContent}
                        />
                        <p className="quiet-copy">
                          Read-only viewers can inspect the shared Project Doc and citation trace, but only project owners and editors can modify the saved version.
                        </p>
                      </>
                    )}
                    {!canEditProjectDoc ? (
                      <p className="quiet-copy">
                        Your project role can read this Project Doc, but only project owners and editors can save shared document versions.
                      </p>
                    ) : null}
                    {adoptionNeeded ? (
                      <section className="panel" aria-label="citation adoption needed">
                        <h3 className="panel-title">Citation source needs project adoption</h3>
                        <p className="quiet-copy">
                          This cited source is readable to you but is not yet available in the target project library. Add it to the project library before saving shared Project Doc evidence.
                        </p>
                        <p className="quiet-copy">{adoptionNeeded.message}</p>
                        <p className="quiet-copy">Paper asset · {adoptionNeeded.paperAssetId}</p>
                        {adoptionNeeded.sourceLibraryEntryId ? (
                          <p className="quiet-copy">Source library entry · {adoptionNeeded.sourceLibraryEntryId}</p>
                        ) : null}
                        {adoptionNeeded.readerExcerptId ? (
                          <p className="quiet-copy">Reader excerpt · {adoptionNeeded.readerExcerptId}</p>
                        ) : null}
                        {adoptionNeeded.evidenceSpan ? (
                          <p className="quiet-copy">Evidence span · {adoptionNeeded.evidenceSpan}</p>
                        ) : null}
                        {adoptionNeeded.sourceLibraryEntryId ? (
                          <button
                            type="button"
                            className="action-button"
                            disabled={isMutating || !canEditProjectDoc}
                            onClick={() => void handleAdoptCitationSourceAndRetry()}
                          >
                            {isAdoptionPending ? "Adopting source…" : "Add source to project library and retry save"}
                          </button>
                        ) : (
                          <p className="quiet-copy">
                            This save failure did not include a source library entry that the browser can request for adoption. Open the source in Reader or Library and add it to the project library, then retry the save.
                          </p>
                        )}
                      </section>
                    ) : null}
                    {adoptionStatus ? <p className="quiet-copy">{adoptionStatus}</p> : null}
                    {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
                  </div>
                ) : (
                  <>
                    <h2 className="panel-title">Draft canvas</h2>
                    <p className="quiet-copy">
                      Project context · {projectLabel} · {docId || "No document"}
                    </p>
                    <p className="quiet-copy">Open Reader evidence or Project Library citations to start this document.</p>
                    {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
                  </>
                )}
        </article>
        <AiSuggestionPanel
                canEditProjectDoc={canEditProjectDoc}
                documentContent={draftDocumentContent}
                onApply={(nextDocumentContent) => {
                  draftDocumentContentRef.current = nextDocumentContent;
                  setDraftDocumentContent(nextDocumentContent);
                }}
                onClear={() => presenter.clearAiSuggestion()}
                onCreate={async (input) => {
                  await presenter.createAiSuggestion(input);
                }}
                presenter={presenter}
        />
        <aside className="panel">
                <h2 className="panel-title">Versions and references</h2>
                <p className="quiet-copy">review path · published target · citation links</p>
                <p className="quiet-copy">将成熟内容整理进入 Project Docs</p>
                <p className="quiet-copy">Publish state path</p>
                <p className="quiet-copy">draft · review · published</p>
                <p className="quiet-copy">
                  Latest content size · {draftProjection.length} characters
                </p>
                <section className="stack-sm" aria-label="citation trace panel">
                  <h3 className="panel-title">Citation trace</h3>
                  <p className="quiet-copy">Read-only server-authorized citation provenance.</p>
                  <p className="quiet-copy">
                    Project Docs accept selected Reader evidence, project Library citations, and reviewed references; whole private Notebook drafts stay owner-only.
                  </p>
                  {presenter.isCitationTraceLoading ? (
                    <p className="quiet-copy">Loading citation trace…</p>
                  ) : presenter.citationTraceError ? (
                    <p className="quiet-copy">{presenter.citationTraceError}</p>
                  ) : presenter.citationTrace && presenter.citationTrace.citations.length > 0 ? (
                    <ul className="stack-sm">
                      {presenter.citationTrace.citations.map((row) => (
                        <CitationTraceRow key={row.citationId} row={row} />
                      ))}
                    </ul>
                  ) : (
                    <CitationTraceEmptyState trace={presenter.citationTrace} />
                  )}
                </section>
        </aside>
      </section>
    </main>
  );
}
