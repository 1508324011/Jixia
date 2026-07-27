import type {
  LiteratureDiscoverySearchResponse,
  LiteratureSearchProviderKey
} from "@jixia/shared";

import type { LiteratureCursorCodec } from "./cursor-codec.js";
import type { CrossrefNormalizedWork } from "./crossref/crossref.types.js";
import type { PubMedNormalizedArticle } from "./ncbi/ncbi.types.js";
import type { OpenAlexNormalizedWork } from "./openalex/openalex.types.js";

export type LiteratureDiscoveryNormalizedRecord =
  | OpenAlexNormalizedWork
  | CrossrefNormalizedWork
  | PubMedNormalizedArticle;

export type LiteratureDiscoveryProviderSearchInput = {
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export type LiteratureDiscoveryProviderSearchResult = {
  readonly records: readonly LiteratureDiscoveryNormalizedRecord[];
  readonly nextCursor: string | null;
};

export type LiteratureDiscoverySearchAdapter = {
  readonly search: (
    input: LiteratureDiscoveryProviderSearchInput
  ) => Promise<LiteratureDiscoveryProviderSearchResult>;
};

export type LiteratureDiscoveryAdapters = Readonly<
  Record<LiteratureSearchProviderKey, LiteratureDiscoverySearchAdapter>
>;

export type LiteratureDiscoverySearchInput = {
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
};

export type LiteratureDiscoveryService = {
  readonly search: (
    input: LiteratureDiscoverySearchInput
  ) => Promise<LiteratureDiscoverySearchResponse>;
};

export type LiteratureDiscoveryServiceDependencies = {
  readonly adapters: LiteratureDiscoveryAdapters;
  readonly cursorCodec: LiteratureCursorCodec;
  readonly now?: () => number;
};

export type LiteratureDiscoveryErrorCode =
  | "invalid_cursor"
  | "discovery_rate_limited"
  | "discovery_unconfigured"
  | "discovery_unavailable";

export class LiteratureDiscoveryError extends Error {
  readonly name = "LiteratureDiscoveryError";

  constructor(
    readonly code: LiteratureDiscoveryErrorCode,
    readonly statusCode: 400 | 429 | 503
  ) {
    super(code);
  }
}
