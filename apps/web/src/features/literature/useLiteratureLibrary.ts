import { literatureLibraryMaxLimit, type ListLiteratureRequest, type ListLiteratureResponse, type LiteratureSummaryDTO } from "@jixia/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api";

export type LiteratureLibraryScope =
  | {
      readonly scope: "personal";
    }
  | {
      readonly projectId: string;
      readonly scope: "project";
    };

type LiteratureLibraryState = "loading" | "ready" | "error";

type LiteratureLibrarySnapshot = {
  readonly error: string | null;
  readonly isLoadingMore: boolean;
  readonly literature: readonly LiteratureSummaryDTO[];
  readonly nextCursor: string | null;
  readonly scopeKey: string;
  readonly state: LiteratureLibraryState;
};

type UseLiteratureLibraryOptions = {
  readonly errorFallback: string;
  readonly limit: number;
  readonly source: LiteratureLibraryScope;
};

export type LiteratureLibraryResult = {
  readonly error: string | null;
  readonly hasMore: boolean;
  readonly isLoadingMore: boolean;
  readonly literature: readonly LiteratureSummaryDTO[];
  readonly loadMore: () => void;
  readonly reload: () => void;
  readonly state: LiteratureLibraryState;
};

export function useLiteratureLibrary({ errorFallback, limit, source }: UseLiteratureLibraryOptions): LiteratureLibraryResult {
  const scopeKey = literatureScopeKey(source);
  const [snapshot, setSnapshot] = useState<LiteratureLibrarySnapshot>({
    error: null,
    isLoadingMore: false,
    literature: [],
    nextCursor: null,
    scopeKey,
    state: "loading"
  });
  const requestControllerRef = useRef<AbortController | null>(null);
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), literatureLibraryMaxLimit);

  const loadPage = useCallback(async (cursor: string | null): Promise<void> => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const isInitialPage = cursor === null;

    if (isInitialPage) {
      setSnapshot({
        error: null,
        isLoadingMore: false,
        literature: [],
        nextCursor: null,
        scopeKey,
        state: "loading"
      });
    } else {
      setSnapshot((current) => current.scopeKey === scopeKey
        ? { ...current, error: null, isLoadingMore: true }
        : current);
    }

    try {
      const response = await apiFetch<ListLiteratureResponse>(listPath(source, boundedLimit, cursor), { signal: controller.signal });
      if (controller.signal.aborted || requestControllerRef.current !== controller) return;

      setSnapshot((current) => ({
        error: null,
        isLoadingMore: false,
        literature: isInitialPage || current.scopeKey !== scopeKey
          ? response.literature
          : [...current.literature, ...response.literature],
        nextCursor: response.nextCursor,
        scopeKey,
        state: "ready"
      }));
    } catch (cause) {
      if (controller.signal.aborted || requestControllerRef.current !== controller) return;

      setSnapshot((current) => ({
        error: cause instanceof Error ? cause.message : errorFallback,
        isLoadingMore: false,
        literature: isInitialPage || current.scopeKey !== scopeKey ? [] : current.literature,
        nextCursor: isInitialPage || current.scopeKey !== scopeKey ? null : current.nextCursor,
        scopeKey,
        state: isInitialPage || current.scopeKey !== scopeKey ? "error" : current.state
      }));
    } finally {
      if (requestControllerRef.current === controller) {
        setSnapshot((current) => current.scopeKey === scopeKey && current.isLoadingMore
          ? { ...current, isLoadingMore: false }
          : current);
      }
    }
  }, [boundedLimit, errorFallback, scopeKey, source]);

  useEffect(() => {
    void loadPage(null);
    return () => requestControllerRef.current?.abort();
  }, [loadPage]);

  const reload = useCallback(() => {
    void loadPage(null);
  }, [loadPage]);

  const isCurrentScope = snapshot.scopeKey === scopeKey;
  const nextCursor = isCurrentScope ? snapshot.nextCursor : null;
  const isLoadingMore = isCurrentScope && snapshot.isLoadingMore;

  const loadMore = useCallback(() => {
    if (nextCursor !== null && !isLoadingMore) void loadPage(nextCursor);
  }, [isLoadingMore, loadPage, nextCursor]);

  return {
    error: isCurrentScope ? snapshot.error : null,
    hasMore: nextCursor !== null,
    isLoadingMore,
    literature: isCurrentScope ? snapshot.literature : [],
    loadMore,
    reload,
    state: isCurrentScope ? snapshot.state : "loading"
  };
}

export function literatureScopeKey(source: LiteratureLibraryScope): string {
  switch (source.scope) {
    case "personal":
      return "personal";
    case "project":
      return `project:${source.projectId}`;
  }
}

function listPath(source: LiteratureLibraryScope, limit: number, cursor: string | null): string {
  const request = listRequest(source, limit, cursor);
  const parameters = new URLSearchParams({ scope: request.scope });
  if (request.scope === "project") parameters.set("projectId", request.projectId);
  parameters.set("limit", String(request.limit ?? limit));
  if (request.cursor !== undefined) parameters.set("cursor", request.cursor);
  return `/literature?${parameters.toString()}`;
}

function listRequest(source: LiteratureLibraryScope, limit: number, cursor: string | null): ListLiteratureRequest {
  switch (source.scope) {
    case "personal":
      return cursor === null ? { scope: "personal", limit } : { scope: "personal", limit, cursor };
    case "project":
      return cursor === null
        ? { scope: "project", projectId: source.projectId, limit }
        : { scope: "project", projectId: source.projectId, limit, cursor };
  }
}
