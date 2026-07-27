import {
  isCanonicalLiteratureDoi,
  normalizeLiteratureDoi,
  normalizeLiteratureText
} from "../../literature.normalization.js";
import {
  LiteraturePayloadError,
  LiteratureProviderError,
  LiteratureProviderIdentityConflictError
} from "../provider-errors.js";
import { createLiteratureProviderTransport } from "../provider-transport.js";
import type {
  LiteratureProviderCallResult,
  LiteratureProviderTransport
} from "../provider-types.js";
import { parseLiteratureJson } from "../safe-parser.js";
import { normalizeCrossrefWork } from "./crossref.normalize.js";
import { createCrossrefRateGate } from "./crossref.rate-gate.js";
import {
  buildCrossrefRequest,
  crossrefOrigin,
  type CrossrefRequest
} from "./crossref.request.js";
import {
  crossrefCursorSchema,
  crossrefSearchEnvelopeSchema,
  crossrefWorkEnvelopeSchema
} from "./crossref.schema.js";
import type {
  CrossrefAdapter,
  CrossrefAdapterConfig,
  CrossrefAdapterDependencies,
  CrossrefNormalizedWork,
  CrossrefSearchResult
} from "./crossref.types.js";

export type {
  CrossrefAdapter,
  CrossrefAdapterConfig,
  CrossrefAdapterDependencies,
  CrossrefDoiInput,
  CrossrefNormalizedWork,
  CrossrefSearchInput,
  CrossrefSearchResult,
  CrossrefSeedInput
} from "./crossref.types.js";

type CrossrefExactCall = {
  readonly action: "fetch_seed" | "doi_lookup";
  readonly doi: string;
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

const crossrefMaximumQueryLength = 512;

export function createCrossrefAdapter(
  config: CrossrefAdapterConfig,
  dependencies: CrossrefAdapterDependencies = {}
): CrossrefAdapter {
  const rateGate = dependencies.rateGate ?? createCrossrefRateGate(
    dependencies.rateGateDependencies
  );
  const transport = createLiteratureProviderTransport<CrossrefRequest>(
    {
      providerKey: "crossref",
      origin: crossrefOrigin,
      rateGate,
      buildRequest: (request) => buildCrossrefRequest(config, request)
    },
    dependencies.transport
  );

  return {
    async search(input) {
      const query = normalizeLiteratureText(input.query);
      const cursor = input.cursor ?? "*";
      if (
        query.length === 0 || query.length > crossrefMaximumQueryLength ||
        !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20 ||
        !crossrefCursorSchema.safeParse(cursor).success
      ) {
        throw rejectedCrossrefRequest("search");
      }
      const call = await transport.get({
        request: {
          kind: "search",
          query,
          limit: input.limit,
          cursor
        },
        operationDeadlineMs: input.operationDeadlineMs,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      });
      return normalizeSearchCall(call, input.limit);
    },
    async fetchSeed(input) {
      return callExactWork(transport, {
        action: "fetch_seed",
        doi: canonicalizeInputDoi(input.recordKey, "fetch_seed"),
        operationDeadlineMs: input.operationDeadlineMs,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      });
    },
    async lookupDoi(input) {
      return callExactWork(transport, {
        action: "doi_lookup",
        doi: canonicalizeInputDoi(input.doi, "doi_lookup"),
        operationDeadlineMs: input.operationDeadlineMs,
        ...(input.signal === undefined ? {} : { signal: input.signal })
      });
    }
  };
}

async function callExactWork(
  transport: LiteratureProviderTransport<CrossrefRequest>,
  input: CrossrefExactCall
): Promise<CrossrefNormalizedWork> {
  const call = await transport.get({
    request: { kind: "work", action: input.action, doi: input.doi },
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  try {
    const envelope = parseLiteratureJson({
      text: call.body,
      schema: crossrefWorkEnvelopeSchema
    });
    const normalized = normalizeCrossrefWork(envelope.message);
    if (normalized.doi !== input.doi) {
      throw new LiteratureProviderIdentityConflictError({
        providerKey: "crossref",
        action: input.action,
        attempt: call.attempts,
        statusClass: "2xx",
        latencyMs: 0
      });
    }
    return normalized;
  } catch (error) {
    if (error instanceof LiteraturePayloadError) {
      throw toProviderPayloadError(error, input.action, call.attempts);
    }
    throw error;
  }
}

function normalizeSearchCall(
  call: LiteratureProviderCallResult,
  requestedLimit: number
): CrossrefSearchResult {
  try {
    const envelope = parseLiteratureJson({
      text: call.body,
      schema: crossrefSearchEnvelopeSchema
    });
    if (envelope.message.items.length > requestedLimit) {
      throw new LiteraturePayloadError("invalid_response");
    }
    const records = envelope.message.items.map(normalizeCrossrefWork);
    return {
      records,
      nextCursor: records.length < requestedLimit ? null : envelope.message["next-cursor"]
    };
  } catch (error) {
    if (error instanceof LiteraturePayloadError) {
      throw toProviderPayloadError(error, "search", call.attempts);
    }
    throw error;
  }
}

function canonicalizeInputDoi(value: string, action: string): string {
  const doi = normalizeLiteratureDoi(value);
  if (doi.length <= 512 && isCanonicalLiteratureDoi(doi)) {
    return doi;
  }
  throw rejectedCrossrefRequest(action);
}

function rejectedCrossrefRequest(action: string): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: "crossref",
    action,
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "provider_rejected"
  });
}

function toProviderPayloadError(
  error: LiteraturePayloadError,
  action: string,
  attempt: number
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: "crossref",
    action,
    attempt,
    statusClass: "2xx",
    latencyMs: 0,
    code: error.code === "response_too_large" ? "response_too_large" : "invalid_response"
  });
}
