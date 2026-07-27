import type { LiteratureDiscoverySearchResponse } from "@jixia/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api";

const SEARCH_PAGE_SIZE = 20;

export type LiteratureSearchState = {
  readonly error: string | null;
  readonly response: LiteratureDiscoverySearchResponse | null;
  readonly status: "idle" | "loading" | "ready" | "error";
};

type UseLiteratureSearchOptions = {
  readonly unavailableMessage: string;
};

export function useLiteratureSearch({ unavailableMessage }: UseLiteratureSearchOptions) {
  const activeRequest = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const [state, setState] = useState<LiteratureSearchState>({ error: null, response: null, status: "idle" });

  const search = useCallback(async (query: string, cursor: string | null = null): Promise<void> => {
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    const version = requestVersion.current + 1;
    requestVersion.current = version;

    setState((current) => ({
      error: null,
      response: cursor === null ? null : current.response,
      status: "loading"
    }));

    try {
      const response = await apiFetch<LiteratureDiscoverySearchResponse>("/literature/discovery/search", {
        method: "POST",
        signal: controller.signal,
        json: cursor === null ? { query, limit: SEARCH_PAGE_SIZE } : { query, limit: SEARCH_PAGE_SIZE, cursor }
      });
      if (controller.signal.aborted || requestVersion.current !== version) return;

      setState((current) => ({
        error: null,
        response: cursor === null
          ? response
          : { ...response, candidates: [...(current.response?.candidates ?? []), ...response.candidates] },
        status: "ready"
      }));
    } catch (error) {
      if (controller.signal.aborted || requestVersion.current !== version) return;
      setState((current) => ({
        error: error instanceof Error ? error.message : unavailableMessage,
        response: cursor === null ? null : current.response,
        status: "error"
      }));
    }
  }, [unavailableMessage]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  return { search, state };
}
