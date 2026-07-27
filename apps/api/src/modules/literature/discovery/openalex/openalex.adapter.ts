import { isCanonicalLiteratureDoi, normalizeLiteratureText } from "../../literature.normalization.js";
import type { OpenAlexProviderConfig } from "../provider-config.js";
import {
  LiteraturePayloadError,
  LiteratureProviderError,
  LiteratureProviderIdentityConflictError
} from "../provider-errors.js";
import { isCanonicalOpenAlexRecordKey } from "../provider-identities.js";
import {
  createLiteratureProviderRateGate,
  literatureRateGateDefaults
} from "../provider-rate-gate.js";
import { createLiteratureProviderTransport } from "../provider-transport.js";
import type { LiteratureProviderTransport } from "../provider-types.js";
import { parseLiteratureJson } from "../safe-parser.js";
import { normalizeOpenAlexWork } from "./openalex.normalization.js";
import {
  buildOpenAlexRequest,
  openAlexOrigin,
  type OpenAlexRequest
} from "./openalex.request.js";
import {
  openAlexSearchResponseSchema,
  openAlexWorkSchema
} from "./openalex.schemas.js";
import type {
  OpenAlexAdapter,
  OpenAlexAdapterDependencies,
  OpenAlexDoiInput,
  OpenAlexNormalizedWork,
  OpenAlexSearchInput,
  OpenAlexSearchResult,
  OpenAlexSeedInput
} from "./openalex.types.js";

export type {
  OpenAlexAdapter,
  OpenAlexAdapterDependencies,
  OpenAlexDoiInput,
  OpenAlexNormalizedWork,
  OpenAlexSearchInput,
  OpenAlexSearchResult,
  OpenAlexSeedInput
} from "./openalex.types.js";

const openAlexMaximumCursorLength = 2_048;

export function createOpenAlexAdapter(
  config: OpenAlexProviderConfig,
  dependencies: OpenAlexAdapterDependencies = {}
): OpenAlexAdapter {
  const rateGate = dependencies.rateGate ?? createLiteratureProviderRateGate(
    literatureRateGateDefaults.openalex
  );
  const transport = createLiteratureProviderTransport<OpenAlexRequest>({
    providerKey: "openalex",
    origin: openAlexOrigin,
    rateGate,
    buildRequest: (request) => buildOpenAlexRequest(config, request)
  }, dependencies.transport);

  return {
    search: (input) => searchOpenAlex(transport, input),
    fetchSeed: (input) => fetchOpenAlexSeed(transport, input),
    lookupDoi: (input) => lookupOpenAlexDoi(transport, input)
  };
}

async function searchOpenAlex(
  transport: LiteratureProviderTransport<OpenAlexRequest>,
  input: OpenAlexSearchInput
): Promise<OpenAlexSearchResult> {
  const query = normalizeLiteratureText(input.query);
  if (query.length === 0 || query.length > 512 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) {
    throw rejectedOpenAlexRequest("search");
  }
  const cursor = input.cursor ?? "*";
  if (cursor.length === 0 || cursor.length > openAlexMaximumCursorLength) {
    throw rejectedOpenAlexRequest("search");
  }
  const result = await transport.get({
    request: { kind: "search", query, limit: input.limit, cursor },
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  return withOpenAlexPayloadErrors("search", result.attempts, () => {
    const parsed = parseLiteratureJson({
      text: result.body,
      schema: openAlexSearchResponseSchema
    });
    if (parsed.meta.per_page !== input.limit || parsed.results.length > input.limit) {
      throw new LiteraturePayloadError("invalid_response");
    }
    return {
      records: parsed.results.map(normalizeOpenAlexWork),
      nextCursor: parsed.meta.next_cursor
    };
  });
}

async function fetchOpenAlexSeed(
  transport: LiteratureProviderTransport<OpenAlexRequest>,
  input: OpenAlexSeedInput
): Promise<OpenAlexNormalizedWork> {
  if (!isCanonicalOpenAlexRecordKey(input.recordKey)) {
    throw rejectedOpenAlexRequest("fetch_seed");
  }
  const result = await transport.get({
    request: { kind: "seed", recordKey: input.recordKey },
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  const work = withOpenAlexPayloadErrors("fetch_seed", result.attempts, () =>
    normalizeOpenAlexWork(parseLiteratureJson({
      text: result.body,
      schema: openAlexWorkSchema
    }))
  );
  if (work.source.recordKey !== input.recordKey) {
    throw invalidOpenAlexResponse("fetch_seed", result.attempts);
  }
  return work;
}

async function lookupOpenAlexDoi(
  transport: LiteratureProviderTransport<OpenAlexRequest>,
  input: OpenAlexDoiInput
): Promise<OpenAlexNormalizedWork> {
  if (!isCanonicalLiteratureDoi(input.doi)) {
    throw rejectedOpenAlexRequest("doi_lookup");
  }
  const result = await transport.get({
    request: { kind: "doi", doi: input.doi },
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  const work = withOpenAlexPayloadErrors("doi_lookup", result.attempts, () =>
    normalizeOpenAlexWork(parseLiteratureJson({
      text: result.body,
      schema: openAlexWorkSchema
    }))
  );
  if (work.doi !== input.doi) {
    throw new LiteratureProviderIdentityConflictError({
      providerKey: "openalex",
      action: "doi_lookup",
      attempt: result.attempts,
      statusClass: "2xx",
      latencyMs: 0
    });
  }
  return work;
}

function withOpenAlexPayloadErrors<TResult>(
  action: string,
  attempts: number,
  operation: () => TResult
): TResult {
  try {
    return operation();
  } catch (error) {
    if (error instanceof LiteraturePayloadError) {
      throw new LiteratureProviderError({
        providerKey: "openalex",
        action,
        attempt: attempts,
        statusClass: "2xx",
        latencyMs: 0,
        code: error.code === "response_too_large" ? "response_too_large" : "invalid_response"
      });
    }
    throw error;
  }
}

function rejectedOpenAlexRequest(action: string): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: "openalex",
    action,
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "provider_rejected"
  });
}

function invalidOpenAlexResponse(action: string, attempt: number): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: "openalex",
    action,
    attempt,
    statusClass: "2xx",
    latencyMs: 0,
    code: "invalid_response"
  });
}
