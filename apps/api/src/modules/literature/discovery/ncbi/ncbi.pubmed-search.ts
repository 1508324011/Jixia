import { normalizeLiteratureText } from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import type { LiteratureProviderTransport } from "../provider-types.js";
import {
  invalidNcbiResponse,
  missingNcbiRecord,
  rejectedNcbiRequest,
  withNcbiPayloadErrors
} from "./ncbi.errors.js";
import { parseNcbiJson } from "./ncbi.payload.js";
import { normalizePubMedSummary } from "./ncbi.pubmed-normalize.js";
import type { PubMedRequest } from "./ncbi.request.js";
import {
  pubMedSearchResponseSchema,
  pubMedSummaryResponseSchema,
  type PubMedSearchResponse,
  type PubMedSummaryRecord
} from "./ncbi.schema.js";
import type {
  PubMedDoiInput,
  PubMedNormalizedArticle,
  PubMedSearchInput,
  PubMedSearchResult
} from "./ncbi.types.js";

type PubMedSearchPage = {
  readonly count: number;
  readonly offset: number;
  readonly ids: readonly string[];
  readonly attempts: number;
};

type PubMedSearchRequest = Extract<PubMedRequest, { readonly kind: "search" }>;
type PubMedSearchCallInput = {
  readonly request: PubMedSearchRequest;
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

const cursorPattern = /^(?:0|[1-9]\d{0,3})$/u;
const maximumPubMedWindow = 10_000;

export async function searchPubMed(
  transport: LiteratureProviderTransport<PubMedRequest>,
  input: PubMedSearchInput
): Promise<PubMedSearchResult> {
  const query = normalizeLiteratureText(input.query);
  const offset = parseSearchInput(query, input.limit, input.cursor);
  const page = await fetchSearchPage(transport, {
    request: {
      kind: "search",
      action: "search",
      term: query,
      limit: input.limit,
      offset
    },
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  if (page.ids.length === 0) {
    return { records: [], nextCursor: null };
  }
  const summaryResult = await transport.get({
    request: { kind: "summary", ids: page.ids },
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  const records = parseSummaryPage(
    summaryResult.body,
    summaryResult.attempts,
    page.ids
  );
  const nextOffset = page.offset + page.ids.length;
  const boundedCount = Math.min(page.count, maximumPubMedWindow);
  return {
    records,
    nextCursor: nextOffset < boundedCount ? String(nextOffset) : null
  };
}

export async function resolvePubMedDoi(
  transport: LiteratureProviderTransport<PubMedRequest>,
  input: PubMedDoiInput
): Promise<string> {
  const page = await fetchSearchPage(transport, {
    request: {
      kind: "search",
      action: "doi_lookup",
      term: `${input.doi}[AID]`,
      limit: 2,
      offset: 0
    },
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
  if (page.count === 0 && page.ids.length === 0) {
    throw missingNcbiRecord("pubmed", "doi_lookup", page.attempts);
  }
  const pmid = page.ids[0];
  if (page.count !== 1 || page.ids.length !== 1 || pmid === undefined) {
    throw invalidNcbiResponse("pubmed", "doi_lookup", page.attempts);
  }
  return pmid;
}

async function fetchSearchPage(
  transport: LiteratureProviderTransport<PubMedRequest>,
  input: PubMedSearchCallInput
): Promise<PubMedSearchPage> {
  const result = await transport.get(input);
  return withNcbiPayloadErrors("pubmed", input.request.action, result.attempts, () => {
    const parsed = parseNcbiJson({
      text: result.body,
      schema: pubMedSearchResponseSchema
    });
    return normalizeSearchPage(
      parsed,
      input.request.offset,
      input.request.limit,
      result.attempts
    );
  });
}

function normalizeSearchPage(
  response: PubMedSearchResponse,
  expectedOffset: number,
  requestedLimit: number,
  attempts: number
): PubMedSearchPage {
  const count = parseNaturalNumber(response.esearchresult.count);
  const offset = parseNaturalNumber(response.esearchresult.retstart);
  const returned = parseNaturalNumber(response.esearchresult.retmax);
  const ids = response.esearchresult.idlist;
  if (
    offset !== expectedOffset || returned !== ids.length ||
    returned > requestedLimit || new Set(ids).size !== ids.length ||
    offset + ids.length > count || (ids.length === 0 && offset < count)
  ) {
    throw invalidPubMedPayload();
  }
  return { count, offset, ids, attempts };
}

function parseSummaryPage(
  body: string,
  attempts: number,
  expectedIds: readonly string[]
): readonly PubMedNormalizedArticle[] {
  return withNcbiPayloadErrors("pubmed", "search", attempts, () => {
    const parsed = parseNcbiJson({
      text: body,
      schema: pubMedSummaryResponseSchema
    });
    const uids = parsed.result["uids"];
    if (
      uids === undefined || !isPmidList(uids) || !sameValues(uids, expectedIds) ||
      !hasExactSummaryKeys(parsed.result, expectedIds)
    ) {
      throw invalidNcbiResponse("pubmed", "search", attempts);
    }
    return expectedIds.map((pmid) => {
      const record = parsed.result[pmid];
      if (record === undefined || !isSummaryRecord(record)) {
        throw invalidNcbiResponse("pubmed", "search", attempts);
      }
      return normalizePubMedSummary(record, pmid);
    });
  });
}

function hasExactSummaryKeys(
  result: Readonly<Record<string, readonly string[] | PubMedSummaryRecord>>,
  expectedIds: readonly string[]
): boolean {
  const expectedKeys = new Set(["uids", ...expectedIds]);
  const actualKeys = Object.keys(result);
  return actualKeys.length === expectedKeys.size && actualKeys.every(
    (key) => expectedKeys.has(key)
  );
}

function parseSearchInput(
  query: string,
  limit: number,
  cursor: string | undefined
): number {
  const offsetText = cursor ?? "0";
  if (
    query.length === 0 || query.length > 512 ||
    !Number.isInteger(limit) || limit < 1 || limit > 20 ||
    !cursorPattern.test(offsetText)
  ) {
    throw rejectedNcbiRequest("pubmed", "search");
  }
  const offset = Number(offsetText);
  if (offset + limit > maximumPubMedWindow) {
    throw rejectedNcbiRequest("pubmed", "search");
  }
  return offset;
}

function parseNaturalNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw invalidPubMedPayload();
  }
  return parsed;
}

function sameValues(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length && left.every(
    (value, index) => value === right[index]
  );
}

function isPmidList(
  value: readonly string[] | PubMedSummaryRecord
): value is readonly string[] {
  return Array.isArray(value);
}

function isSummaryRecord(
  value: readonly string[] | PubMedSummaryRecord
): value is PubMedSummaryRecord {
  return !Array.isArray(value);
}

function invalidPubMedPayload(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
