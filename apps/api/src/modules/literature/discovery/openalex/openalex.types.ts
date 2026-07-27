import type { LiteratureDiscoveryCandidateDTO } from "@jixia/shared";

import type {
  LiteratureProviderRateGate,
  LiteratureProviderTransportDependencies
} from "../provider-types.js";

export type OpenAlexNormalizedWork = Omit<
  LiteratureDiscoveryCandidateDTO,
  "sourceMatches"
> & {
  readonly source: {
    readonly providerKey: "openalex";
    readonly recordKey: string;
  };
};

type OpenAlexCallContext = {
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export type OpenAlexSearchInput = OpenAlexCallContext & {
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type OpenAlexSearchResult = {
  readonly records: readonly OpenAlexNormalizedWork[];
  readonly nextCursor: string | null;
};

export type OpenAlexSeedInput = OpenAlexCallContext & {
  readonly recordKey: string;
};

export type OpenAlexDoiInput = OpenAlexCallContext & {
  readonly doi: string;
};

export type OpenAlexAdapter = {
  readonly search: (input: OpenAlexSearchInput) => Promise<OpenAlexSearchResult>;
  readonly fetchSeed: (input: OpenAlexSeedInput) => Promise<OpenAlexNormalizedWork>;
  readonly lookupDoi: (input: OpenAlexDoiInput) => Promise<OpenAlexNormalizedWork>;
};

export type OpenAlexAdapterDependencies = {
  readonly rateGate?: LiteratureProviderRateGate;
  readonly transport?: LiteratureProviderTransportDependencies;
};
