import type { LiteratureDiscoveryCandidateDTO, LiteratureSearchProviderKey } from "@jixia/shared";

import { createLiteratureCursorCodec } from "./cursor-codec.js";
import type { CrossrefNormalizedWork } from "./crossref/crossref.types.js";
import type {
  LiteratureDiscoveryAdapters,
  LiteratureDiscoveryProviderSearchInput,
  LiteratureDiscoveryProviderSearchResult,
  LiteratureDiscoverySearchAdapter
} from "./discovery.types.js";
import type { PubMedNormalizedArticle } from "./ncbi/ncbi.types.js";
import type { OpenAlexNormalizedWork } from "./openalex/openalex.types.js";
import { LiteratureProviderError } from "./provider-errors.js";

export const discoveryTestSecret = "discovery-test-secret-that-is-at-least-32-bytes";
export const discoveryTestNowMs = Date.parse("2026-07-20T00:00:00.000Z");

type CandidateFields = Omit<LiteratureDiscoveryCandidateDTO, "sourceMatches">;
type CandidateOverrides = Partial<CandidateFields>;

const baseCandidate: CandidateFields = {
  title: "Fixture title",
  abstract: null,
  publicationYear: 2026,
  publicationDate: "2026-07-20",
  venue: "Fixture Journal",
  publicationType: "journal-article",
  doi: null,
  authors: [],
  identifiers: [],
  openAccess: null,
  publisher: null
};

export function openAlexRecord(
  recordKey: string,
  overrides: CandidateOverrides = {}
): OpenAlexNormalizedWork {
  return { ...baseCandidate, ...overrides, source: { providerKey: "openalex", recordKey } };
}

export function crossrefRecord(
  recordKey: string,
  overrides: CandidateOverrides = {}
): CrossrefNormalizedWork {
  return { ...baseCandidate, ...overrides, source: { providerKey: "crossref", recordKey } };
}

export function pubMedRecord(
  recordKey: string,
  overrides: CandidateOverrides = {}
): PubMedNormalizedArticle {
  return { ...baseCandidate, ...overrides, source: { providerKey: "pubmed", recordKey } };
}

export type DiscoveryAdapterStep =
  | {
      readonly kind: "success";
      readonly result: LiteratureDiscoveryProviderSearchResult;
    }
  | { readonly kind: "failure"; readonly error: LiteratureProviderError };

class DiscoveryFixtureError extends Error {
  readonly name = "DiscoveryFixtureError";
}

export class RecordingDiscoveryAdapter implements LiteratureDiscoverySearchAdapter {
  readonly calls: LiteratureDiscoveryProviderSearchInput[] = [];

  constructor(private readonly steps: DiscoveryAdapterStep[]) {}

  async search(
    input: LiteratureDiscoveryProviderSearchInput
  ): Promise<LiteratureDiscoveryProviderSearchResult> {
    this.calls.push(input);
    const step = this.steps.shift();
    if (step === undefined) {
      throw new DiscoveryFixtureError("Unexpected discovery adapter call");
    }
    switch (step.kind) {
      case "success":
        return step.result;
      case "failure":
        throw step.error;
    }
  }
}

export class GeneratingDiscoveryAdapter implements LiteratureDiscoverySearchAdapter {
  readonly calls: LiteratureDiscoveryProviderSearchInput[] = [];

  constructor(private readonly providerKey: LiteratureSearchProviderKey) {}

  async search(
    input: LiteratureDiscoveryProviderSearchInput
  ): Promise<LiteratureDiscoveryProviderSearchResult> {
    this.calls.push(input);
    const page = this.calls.length;
    const records = Array.from({ length: input.limit }, (_, index) => {
      switch (this.providerKey) {
        case "openalex":
          return openAlexRecord(`W${page}-${index}`, { doi: null });
        case "crossref":
          return crossrefRecord(`crossref-${page}-${index}`, { doi: null });
        case "pubmed":
          return pubMedRecord(`${page}-${index}`, { doi: null });
      }
    });
    return {
      records,
      nextCursor: `${this.providerKey}-${page + 1}`
    };
  }
}

export function successfulStep(
  records: LiteratureDiscoveryProviderSearchResult["records"],
  nextCursor: string | null = null
): DiscoveryAdapterStep {
  return { kind: "success", result: { records, nextCursor } };
}

export function failedStep(
  providerKey: LiteratureSearchProviderKey,
  code: ConstructorParameters<typeof LiteratureProviderError>[0]["code"]
): DiscoveryAdapterStep {
  return {
    kind: "failure",
    error: new LiteratureProviderError({
      providerKey,
      action: "search",
      attempt: 1,
      statusClass: code === "rate_limited" ? "4xx" : null,
      latencyMs: 1,
      code
    })
  };
}

export function createRecordingDiscoveryAdapters(input: {
  readonly openalex: DiscoveryAdapterStep[];
  readonly crossref: DiscoveryAdapterStep[];
  readonly pubmed: DiscoveryAdapterStep[];
}): {
  readonly adapters: LiteratureDiscoveryAdapters;
  readonly openalex: RecordingDiscoveryAdapter;
  readonly crossref: RecordingDiscoveryAdapter;
  readonly pubmed: RecordingDiscoveryAdapter;
} {
  const openalex = new RecordingDiscoveryAdapter(input.openalex);
  const crossref = new RecordingDiscoveryAdapter(input.crossref);
  const pubmed = new RecordingDiscoveryAdapter(input.pubmed);
  return {
    adapters: { openalex, crossref, pubmed },
    openalex,
    crossref,
    pubmed
  };
}

export function createDiscoveryTestCodec(now: () => number = () => discoveryTestNowMs) {
  return createLiteratureCursorCodec({ secret: discoveryTestSecret, now });
}
