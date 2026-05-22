import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  extractDocumentBlockReferences,
} from "@shared/contracts/document-content";
import type {
  DocumentBlockDocument,
  DocumentBlockReference,
} from "@shared/contracts/document-content";
import {
  PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
} from "@shared/contracts/project-docs";
import type {
  CreateProjectDocAiSuggestionRequest,
  CreateProjectDocAiSuggestionResponse,
  ProjectDocCitationSourceUnavailableDetails,
  ProjectDocCitationTraceResponse,
  ProjectDocCitationRecord,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from "@shared/contracts/project-docs";

import { ApiError, apiClient } from "../lib/http-client";
import { createEditableDocumentContent } from "../lib/document-blocks";
import { useProjectContext } from "./project-context";

interface SaveProjectDocInput {
  citations: Array<{
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content?: string;
  documentContent: DocumentBlockDocument;
}

interface CreateProjectDocAiSuggestionInput
  extends CreateProjectDocAiSuggestionRequest {}

export interface ProjectDocPresenterCitation extends ProjectDocCitationRecord {
  libraryEntryId?: string;
}

export interface ProjectDocCitationAdoptionState {
  evidenceSpan?: string;
  libraryEntryId?: string;
  message: string;
  paperAssetId: string;
  projectId: string;
  readerExcerptId?: string;
  sourceLibraryEntryId?: string;
}

export interface ProjectDocPresenterViewModel {
  adoptionNeeded: ProjectDocCitationAdoptionState | null;
  adoptCitationSource(): Promise<boolean>;
  aiSuggestion: CreateProjectDocAiSuggestionResponse | null;
  aiSuggestionError: string | null;
  citations: ProjectDocPresenterCitation[];
  content: string;
  createAiSuggestion(
    input: CreateProjectDocAiSuggestionInput,
  ): Promise<boolean>;
  clearAiSuggestion(): void;
  documentContent: DocumentBlockDocument;
  document: ProjectDocRecord | null;
  error: string | null;
  citationTrace: ProjectDocCitationTraceResponse | null;
  citationTraceError: string | null;
  isCitationTraceLoading: boolean;
  isCreatingAiSuggestion: boolean;
  isLoading: boolean;
  isProjectLoading: boolean;
  isSaving: boolean;
  project: ReturnType<typeof useProjectContext>["project"];
  projectError: string | null;
  refresh(): Promise<void>;
  save(input: SaveProjectDocInput): Promise<boolean>;
  snapshot: ProjectDocSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readCitationSourceUnavailableDetails(
  value: unknown,
): ProjectDocCitationSourceUnavailableDetails | null {
  if (!isRecord(value)) {
    return null;
  }

  const paperAssetId = optionalString(value.paperAssetId);
  const projectId = optionalString(value.projectId);

  if (!paperAssetId || !projectId) {
    return null;
  }

  return {
    evidenceSpan: optionalString(value.evidenceSpan),
    libraryEntryId: optionalString(value.libraryEntryId),
    paperAssetId,
    projectId,
    readerExcerptId: optionalString(value.readerExcerptId),
    sourceLibraryEntryId: optionalString(value.sourceLibraryEntryId),
  };
}

function findReferenceForUnavailableCitation(
  documentContent: DocumentBlockDocument,
  details: ProjectDocCitationSourceUnavailableDetails,
): DocumentBlockReference | null {
  const references = extractDocumentBlockReferences(documentContent);
  const matchingReaderExcerpt = details.readerExcerptId
    ? references.find((reference) => reference.readerExcerptId === details.readerExcerptId)
    : undefined;
  const matchingLibraryEntry = details.libraryEntryId
    ? references.find((reference) => reference.libraryEntryId === details.libraryEntryId)
    : undefined;
  const matchingAssetWithEntry = references.find(
    (reference) => reference.paperAssetId === details.paperAssetId && reference.libraryEntryId,
  );
  const matchingAsset = references.find(
    (reference) => reference.paperAssetId === details.paperAssetId,
  );

  return matchingReaderExcerpt ?? matchingLibraryEntry ?? matchingAssetWithEntry ?? matchingAsset ?? null;
}

function createAdoptionStateFromError(
  error: unknown,
  documentContent: DocumentBlockDocument,
): ProjectDocCitationAdoptionState | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE
  ) {
    return null;
  }

  const details = readCitationSourceUnavailableDetails(error.details);

  if (!details) {
    return null;
  }

  const matchingReference = findReferenceForUnavailableCitation(documentContent, details);
  const sourceLibraryEntryId =
    details.sourceLibraryEntryId ??
    details.libraryEntryId ??
    matchingReference?.libraryEntryId;

  return {
    evidenceSpan: details.evidenceSpan ?? matchingReference?.evidenceSpan,
    libraryEntryId: details.libraryEntryId ?? matchingReference?.libraryEntryId,
    message: error.message,
    paperAssetId: details.paperAssetId,
    projectId: details.projectId,
    readerExcerptId: details.readerExcerptId ?? matchingReference?.readerExcerptId,
    sourceLibraryEntryId,
  };
}

function buildProjectDocMismatchError(
  documentId: string,
  routeProjectId: string,
  resolvedProjectId: string,
): string {
  return `Document ${documentId} belongs to project ${resolvedProjectId}, not route project ${routeProjectId}.`;
}

function buildProjectDocCitationKey(input: {
  paperAssetId: string;
  readerExcerptId?: string;
}): string {
  return input.readerExcerptId
    ? `excerpt:${input.readerExcerptId}`
    : `asset:${input.paperAssetId}`;
}

function buildProjectDocCitationEvidenceKey(input: {
  evidenceSpan?: string;
  paperAssetId: string;
}): string | null {
  return input.evidenceSpan
    ? `asset:${input.paperAssetId}:evidence:${input.evidenceSpan}`
    : null;
}

function readRuntimeCitationLibraryEntryId(
  citation: ProjectDocCitationRecord,
): string | undefined {
  const libraryEntryId = (
    citation as ProjectDocCitationRecord & { libraryEntryId?: unknown }
  ).libraryEntryId;

  return typeof libraryEntryId === "string" && libraryEntryId.trim()
    ? libraryEntryId.trim()
    : undefined;
}

function createProjectDocPresenterCitations(
  snapshot: ProjectDocSnapshot | null,
  documentContent: DocumentBlockDocument,
): ProjectDocPresenterCitation[] {
  if (!snapshot) {
    return [];
  }

  const referencesByKey = new Map<string, DocumentBlockReference>();
  const referencesByEvidenceKey = new Map<string, DocumentBlockReference>();
  const referencesByAssetKey = new Map<string, DocumentBlockReference>();

  for (const reference of extractDocumentBlockReferences(documentContent)) {
    const referenceKey = buildProjectDocCitationKey(reference);
    const evidenceKey = buildProjectDocCitationEvidenceKey(reference);
    const assetKey = `asset:${reference.paperAssetId}`;

    if (!referencesByKey.has(referenceKey)) {
      referencesByKey.set(referenceKey, reference);
    }

    if (evidenceKey && !referencesByEvidenceKey.has(evidenceKey)) {
      referencesByEvidenceKey.set(evidenceKey, reference);
    }

    if (!referencesByAssetKey.has(assetKey)) {
      referencesByAssetKey.set(assetKey, reference);
    }
  }

  return snapshot.citations.map((citation) => {
    const citationEvidenceKey = buildProjectDocCitationEvidenceKey(citation);
    const matchingReference =
      referencesByKey.get(buildProjectDocCitationKey(citation)) ??
      (citationEvidenceKey
        ? referencesByEvidenceKey.get(citationEvidenceKey)
        : undefined) ??
      referencesByAssetKey.get(`asset:${citation.paperAssetId}`);

    return {
      ...citation,
      evidenceSpan: citation.evidenceSpan ?? matchingReference?.evidenceSpan,
      libraryEntryId:
        readRuntimeCitationLibraryEntryId(citation) ??
        matchingReference?.libraryEntryId,
      readerExcerptId:
        citation.readerExcerptId ?? matchingReference?.readerExcerptId,
    };
  });
}

export function useProjectDocPresenter(
  projectId?: string,
  documentId?: string,
): ProjectDocPresenterViewModel {
  const projectContext = useProjectContext(projectId);
  const [snapshot, setSnapshot] = useState<ProjectDocSnapshot | null>(null);
  const [citationTrace, setCitationTrace] = useState<ProjectDocCitationTraceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [citationTraceError, setCitationTraceError] = useState<string | null>(null);
  const [adoptionNeeded, setAdoptionNeeded] = useState<ProjectDocCitationAdoptionState | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<CreateProjectDocAiSuggestionResponse | null>(null);
  const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
  const [isCreatingAiSuggestion, setIsCreatingAiSuggestion] = useState(false);
  const [isCitationTraceLoading, setIsCitationTraceLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMountedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const requestKindRef = useRef<"refresh" | "save" | "aiSuggestion" | null>(null);

  const canCommitRequest = useCallback((generation: number) => {
    return isMountedRef.current && requestGenerationRef.current === generation;
  }, []);

  const invalidatePendingRequests = useCallback(() => {
    requestGenerationRef.current += 1;
    requestKindRef.current = null;
    setIsLoading(false);
    setIsSaving(false);
    setIsCreatingAiSuggestion(false);
    setIsCitationTraceLoading(false);
  }, []);

  const beginRequest = useCallback((kind: "refresh" | "save" | "aiSuggestion") => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    requestKindRef.current = kind;

    if (kind === "refresh") {
      setIsLoading(true);
      setIsSaving(false);
      setIsCreatingAiSuggestion(false);
    } else {
      if (kind === "save") {
        setIsSaving(true);
        setIsLoading(false);
        setIsCreatingAiSuggestion(false);
      } else {
        setIsCreatingAiSuggestion(true);
        setIsLoading(false);
        setIsSaving(false);
      }
    }

    return generation;
  }, []);

  const completeRequest = useCallback(
    (generation: number, kind: "refresh" | "save" | "aiSuggestion") => {
      if (!canCommitRequest(generation) || requestKindRef.current !== kind) {
        return;
      }

      requestKindRef.current = null;

      if (kind === "refresh") {
        setIsLoading(false);
        return;
      }

      setIsSaving(false);
      setIsCreatingAiSuggestion(false);
    },
    [canCommitRequest],
  );

  const clearAiSuggestion = useCallback(() => {
    setAiSuggestion(null);
    setAiSuggestionError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!projectId || !documentId || !projectContext.project || projectContext.error) {
      invalidatePendingRequests();
      setSnapshot(null);
      setCitationTrace(null);
      setError(null);
      setCitationTraceError(null);
      setAdoptionNeeded(null);
      setIsLoading(false);
      return;
    }

    const generation = beginRequest("refresh");

    try {
      setError(null);
      setCitationTraceError(null);
      setAdoptionNeeded(null);
      setIsCitationTraceLoading(true);
      const nextSnapshot = await apiClient.getProjectDoc(documentId);

      if (!canCommitRequest(generation)) {
        return;
      }

      setSnapshot(nextSnapshot);

      if (nextSnapshot.document.projectId !== projectId) {
        setError(
          buildProjectDocMismatchError(
            documentId,
            projectId,
            nextSnapshot.document.projectId,
          ),
        );
        setCitationTrace(null);
        setIsCitationTraceLoading(false);
        return;
      }

      try {
        const nextCitationTrace = await apiClient.getProjectDocCitationTrace(documentId);

        if (!canCommitRequest(generation)) {
          return;
        }

        setCitationTrace(nextCitationTrace);
        setCitationTraceError(null);
      } catch (traceError) {
        if (!canCommitRequest(generation)) {
          return;
        }

        setCitationTrace(null);
        setCitationTraceError(
          traceError instanceof Error
            ? traceError.message
            : "Failed to load the project document citation trace.",
        );
      } finally {
        if (canCommitRequest(generation)) {
          setIsCitationTraceLoading(false);
        }
      }
    } catch (presenterError) {
      if (!canCommitRequest(generation)) {
        return;
      }

      setSnapshot(null);
      setCitationTrace(null);
      setAdoptionNeeded(null);
      setIsCitationTraceLoading(false);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load the project document.",
      );
    } finally {
      completeRequest(generation, "refresh");
    }
  }, [beginRequest, canCommitRequest, completeRequest, documentId, invalidatePendingRequests, projectContext.error, projectContext.project, projectId]);

  const createAiSuggestion = useCallback(
    async (input: CreateProjectDocAiSuggestionInput) => {
      if (!projectId || !documentId || !projectContext.project) {
        invalidatePendingRequests();
        setAiSuggestionError(
          "A visible project and document route are required before creating a suggestion.",
        );
        return false;
      }

      const generation = beginRequest("aiSuggestion");

      try {
        setAiSuggestionError(null);
        setError(null);

        const nextSuggestion = await apiClient.createProjectDocAiSuggestion(
          documentId,
          input,
        );

        if (!canCommitRequest(generation)) {
          return false;
        }

        setAiSuggestion(nextSuggestion);
        return true;
      } catch (presenterError) {
        if (!canCommitRequest(generation)) {
          return false;
        }

        setAiSuggestionError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to create the Project Doc AI suggestion.",
        );
        return false;
      } finally {
        completeRequest(generation, "aiSuggestion");
      }
    },
    [beginRequest, canCommitRequest, completeRequest, documentId, invalidatePendingRequests, projectContext.project, projectId],
  );

  const save = useCallback(
    async (input: SaveProjectDocInput) => {
      if (!projectId || !documentId || !projectContext.project) {
        invalidatePendingRequests();
        setAdoptionNeeded(null);
        setError("A visible project and document route are required before saving.");
        return false;
      }

      const generation = beginRequest("save");

      try {
        setError(null);
        setCitationTraceError(null);
        setAdoptionNeeded(null);
        const nextSnapshot = await apiClient.saveProjectDocVersion(
          documentId,
          input,
        );

        if (!canCommitRequest(generation)) {
          return false;
        }

        setSnapshot(nextSnapshot);

        if (nextSnapshot.document.projectId !== projectId) {
          setError(
            buildProjectDocMismatchError(
              documentId,
              projectId,
              nextSnapshot.document.projectId,
            ),
          );
          setCitationTrace(null);
          return false;
        }

        setIsCitationTraceLoading(true);

        try {
          const nextCitationTrace = await apiClient.getProjectDocCitationTrace(documentId);

          if (!canCommitRequest(generation)) {
            return false;
          }

          setCitationTrace(nextCitationTrace);
          setCitationTraceError(null);
        } catch (traceError) {
          if (!canCommitRequest(generation)) {
            return false;
          }

          setCitationTrace(null);
          setCitationTraceError(
            traceError instanceof Error
              ? traceError.message
              : "Failed to load the project document citation trace.",
          );
        } finally {
          if (canCommitRequest(generation)) {
            setIsCitationTraceLoading(false);
          }
        }

        return true;
      } catch (presenterError) {
        if (!canCommitRequest(generation)) {
          return false;
        }

        const nextAdoptionNeeded = createAdoptionStateFromError(
          presenterError,
          input.documentContent,
        );

        setAdoptionNeeded(nextAdoptionNeeded);
        setIsCitationTraceLoading(false);
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to save the project document.",
        );
        return false;
      } finally {
        completeRequest(generation, "save");
      }
    },
    [beginRequest, canCommitRequest, completeRequest, documentId, invalidatePendingRequests, projectContext.project, projectId],
  );

  const adoptCitationSource = useCallback(async () => {
    const adoption = adoptionNeeded;

    if (!adoption?.sourceLibraryEntryId || !projectId || !projectContext.project) {
      setError("A source library entry and visible project are required before adoption.");
      return false;
    }

    try {
      setError(null);
      await apiClient.adoptProjectLibraryEntry(projectId, {
        sourceLibraryEntryId: adoption.sourceLibraryEntryId,
      });
      setAdoptionNeeded(null);
      return true;
    } catch (presenterError) {
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to adopt the citation source into the project library.",
      );
      return false;
    }
  }, [adoptionNeeded, projectContext.project, projectId]);

  const documentContent = useMemo(
    () => createEditableDocumentContent(snapshot),
    [snapshot],
  );
  const citations = useMemo(
    () => createProjectDocPresenterCitations(snapshot, documentContent),
    [documentContent, snapshot],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      invalidatePendingRequests();
    };
  }, [invalidatePendingRequests]);

  useEffect(() => {
    if (projectContext.isLoading) {
      return;
    }

    if (projectContext.error || !projectContext.project || !projectId || !documentId) {
      invalidatePendingRequests();
      clearAiSuggestion();
      setSnapshot(null);
      setCitationTrace(null);
      setError(null);
      setCitationTraceError(null);
      setAdoptionNeeded(null);
      setIsLoading(false);
      return;
    }

    void refresh();
  }, [clearAiSuggestion, documentId, invalidatePendingRequests, projectContext.error, projectContext.isLoading, projectContext.project, projectId, refresh]);

  return useMemo(
    () => ({
      adoptionNeeded,
      adoptCitationSource,
      aiSuggestion,
      aiSuggestionError,
      citationTrace,
      citationTraceError,
      citations,
      content: snapshot?.content ?? "",
      clearAiSuggestion,
      createAiSuggestion,
      documentContent,
      document: snapshot?.document ?? null,
      error,
      isCitationTraceLoading,
      isCreatingAiSuggestion,
      isLoading,
      isProjectLoading: projectContext.isLoading,
      isSaving,
      project: projectContext.project,
      projectError: projectContext.error,
      refresh,
      save,
      snapshot,
    }),
    [adoptionNeeded, adoptCitationSource, aiSuggestion, aiSuggestionError, citationTrace, citationTraceError, citations, clearAiSuggestion, createAiSuggestion, documentContent, error, isCitationTraceLoading, isCreatingAiSuggestion, isLoading, isSaving, projectContext.error, projectContext.isLoading, projectContext.project, refresh, save, snapshot],
  );
}
