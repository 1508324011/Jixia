import {
  LiteratureDiscoveryError,
  type LiteratureDiscoveryProviderSearchInput,
  type LiteratureDiscoverySearchAdapter,
  type LiteratureDiscoverySearchInput,
  type LiteratureDiscoveryService,
  type LiteratureDiscoveryServiceDependencies
} from "./discovery.types.js";
import {
  fingerprintLiteratureDiscoveryRequest,
  literatureDiscoveryMaximumSeenIdentities,
  type LiteratureCursorProviderState,
  type LiteratureCursorSeenIdentity,
  type LiteratureCursorState
} from "./cursor-codec.js";
import {
  allocateLiteratureDiscoveryQuotas,
  mergeAndRankLiteratureDiscoveryRecords
} from "./discovery-merge.js";
import {
  invokeLiteratureDiscoveryProvider,
  type LiteratureDiscoveryProviderOutcome
} from "./discovery-provider.js";
import { normalizeLiteratureDiscoveryQuery } from "./discovery-query.js";
import { LiteratureCursorError } from "./provider-errors.js";

export type {
  LiteratureDiscoveryAdapters,
  LiteratureDiscoveryErrorCode,
  LiteratureDiscoveryNormalizedRecord,
  LiteratureDiscoveryProviderSearchInput,
  LiteratureDiscoveryProviderSearchResult,
  LiteratureDiscoverySearchAdapter,
  LiteratureDiscoverySearchInput,
  LiteratureDiscoveryService,
  LiteratureDiscoveryServiceDependencies
} from "./discovery.types.js";
export { LiteratureDiscoveryError } from "./discovery.types.js";

export function createLiteratureDiscoveryService(
  dependencies: LiteratureDiscoveryServiceDependencies
): LiteratureDiscoveryService {
  const now = dependencies.now ?? Date.now;
  return {
    async search(input) {
      const normalizedQuery = normalizeLiteratureDiscoveryQuery(input.query);
      const requestFingerprint = fingerprintLiteratureDiscoveryRequest({
        normalizedQuery,
        limit: input.limit
      });
      const prior = decodePriorState(dependencies, input, requestFingerprint);
      const page = prior === null ? 1 : prior.page + 1;
      const quotas = allocateLiteratureDiscoveryQuotas(input.limit);
      const operationDeadlineMs = now() + 8_000;
      const initialState = { status: "active", continuation: null } as const;
      const [openalex, crossref, pubmed] = await Promise.all([
        invokeProvider({
          providerKey: "openalex",
          adapter: dependencies.adapters.openalex,
          query: normalizedQuery,
          quota: quotas.openalex,
          operationDeadlineMs,
          state: prior?.providers.openalex ?? initialState,
          ...(input.signal === undefined ? {} : { signal: input.signal })
        }),
        invokeProvider({
          providerKey: "crossref",
          adapter: dependencies.adapters.crossref,
          query: normalizedQuery,
          quota: quotas.crossref,
          operationDeadlineMs,
          state: prior?.providers.crossref ?? initialState,
          ...(input.signal === undefined ? {} : { signal: input.signal })
        }),
        invokeProvider({
          providerKey: "pubmed",
          adapter: dependencies.adapters.pubmed,
          query: normalizedQuery,
          quota: quotas.pubmed,
          operationDeadlineMs,
          state: prior?.providers.pubmed ?? initialState,
          ...(input.signal === undefined ? {} : { signal: input.signal })
        })
      ]);
      const outcomes = [openalex, crossref, pubmed] as const;
      requireProviderSuccess(outcomes);
      const seen = prior?.seenIdentities ?? [];
      const seenKeys = new Set(seen.map(seenIdentityKey));
      const mergedCandidates = mergeAndRankLiteratureDiscoveryRecords({
        openalex: openalex.records,
        crossref: crossref.records,
        pubmed: pubmed.records
      });
      const ranked = [];
      const nextSeen = [...seen];
      let identityBudgetExhausted = false;
      for (const entry of mergedCandidates) {
        const wasUnseen = entry.seenIdentities.every(
          (identity) => !seenKeys.has(seenIdentityKey(identity))
        );
        const entryKeys = new Set<string>();
        const newIdentities = entry.seenIdentities.filter((identity) => {
          const key = seenIdentityKey(identity);
          if (seenKeys.has(key) || entryKeys.has(key)) {
            return false;
          }
          entryKeys.add(key);
          return true;
        });
        if (
          nextSeen.length + newIdentities.length > literatureDiscoveryMaximumSeenIdentities
        ) {
          identityBudgetExhausted = true;
          break;
        }
        for (const identity of newIdentities) {
          const identityKey = seenIdentityKey(identity);
          seenKeys.add(identityKey);
          nextSeen.push(identity);
        }
        if (wasUnseen) {
          ranked.push(entry);
        }
      }
      return {
        candidates: ranked.map((entry) => entry.candidate),
        providerStatuses: outcomes.map((outcome) => outcome.status),
        nextCursor: createNextCursor({
          dependencies,
          requestFingerprint,
          limit: input.limit,
          page,
          outcomes,
          seenIdentities: nextSeen,
          identityBudgetExhausted
        })
      };
    }
  };
}

type ProviderInvocation = {
  readonly providerKey: "openalex" | "crossref" | "pubmed";
  readonly adapter: LiteratureDiscoverySearchAdapter;
  readonly query: string;
  readonly quota: number;
  readonly operationDeadlineMs: number;
  readonly state: LiteratureCursorProviderState;
  readonly signal?: AbortSignal;
};

async function invokeProvider(input: ProviderInvocation): Promise<LiteratureDiscoveryProviderOutcome> {
  const request: LiteratureDiscoveryProviderSearchInput = {
    query: input.query,
    limit: input.quota,
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.state.status === "active" && input.state.continuation !== null
      ? { cursor: input.state.continuation }
      : {}),
    ...(input.signal === undefined ? {} : { signal: input.signal })
  };
  return invokeLiteratureDiscoveryProvider({
    providerKey: input.providerKey,
    adapter: input.adapter,
    request,
    priorState: input.state
  });
}

function decodePriorState(
  dependencies: LiteratureDiscoveryServiceDependencies,
  input: LiteratureDiscoverySearchInput,
  requestFingerprint: string
): LiteratureCursorState | null {
  if (input.cursor === undefined) {
    return null;
  }
  try {
    const state = dependencies.cursorCodec.decode(input.cursor, {
      requestFingerprint,
      limit: input.limit
    });
    const seenKeys = state.seenIdentities.map(seenIdentityKey);
    if (
      state.page >= 5 || state.seenIdentities.length > state.page * state.limit * 2 ||
      new Set(seenKeys).size !== seenKeys.length
    ) {
      throw new LiteratureCursorError();
    }
    return state;
  } catch (error) {
    if (error instanceof LiteratureCursorError) {
      throw new LiteratureDiscoveryError("invalid_cursor", 400);
    }
    throw error;
  }
}

function requireProviderSuccess(outcomes: readonly LiteratureDiscoveryProviderOutcome[]): void {
  if (outcomes.some((outcome) => outcome.calledSuccessfully)) {
    return;
  }
  const failures = outcomes.filter((outcome) => outcome.status.status !== "succeeded");
  if (failures.length > 0 && failures.every(
    (outcome) => outcome.status.status === "rate_limited"
  )) {
    throw new LiteratureDiscoveryError("discovery_rate_limited", 429);
  }
  if (failures.length > 0 && failures.every(
    (outcome) => outcome.status.status === "unconfigured"
  )) {
    throw new LiteratureDiscoveryError("discovery_unconfigured", 503);
  }
  throw new LiteratureDiscoveryError("discovery_unavailable", 503);
}

function createNextCursor(input: {
  readonly dependencies: LiteratureDiscoveryServiceDependencies;
  readonly requestFingerprint: string;
  readonly limit: number;
  readonly page: number;
  readonly outcomes: readonly [
    LiteratureDiscoveryProviderOutcome,
    LiteratureDiscoveryProviderOutcome,
    LiteratureDiscoveryProviderOutcome
  ];
  readonly seenIdentities: readonly LiteratureCursorSeenIdentity[];
  readonly identityBudgetExhausted: boolean;
}): string | null {
  const [openalex, crossref, pubmed] = input.outcomes;
  const hasContinuation = input.outcomes.some((outcome) => outcome.cursorState.status === "active");
  if (
    input.page >= 5 || input.identityBudgetExhausted ||
    input.seenIdentities.length >= literatureDiscoveryMaximumSeenIdentities || !hasContinuation
  ) {
    return null;
  }
  return input.dependencies.cursorCodec.encode({
    requestFingerprint: input.requestFingerprint,
    limit: input.limit,
    page: input.page,
    providers: {
      openalex: openalex.cursorState,
      crossref: crossref.cursorState,
      pubmed: pubmed.cursorState
    },
    seenIdentities: input.seenIdentities
  });
}

function seenIdentityKey(identity: LiteratureCursorSeenIdentity): string {
  switch (identity.kind) {
    case "doi":
      return `doi:${identity.doi}`;
    case "provider":
      return `provider:${identity.providerKey}:${identity.recordKey}`;
  }
}
