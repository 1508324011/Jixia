import type {
  LiteratureDiscoveryCandidateDTO,
  LiteratureSourceIdentity
} from "@jixia/shared";

import type { CrossrefProviderConfig } from "../provider-config.js";
import type { LiteratureRateGateDependencies } from "../provider-rate-gate.js";
import type {
  LiteratureProviderRateGate,
  LiteratureProviderTransportDependencies
} from "../provider-types.js";

export type CrossrefNormalizedWork = Omit<
  LiteratureDiscoveryCandidateDTO,
  "sourceMatches"
> & {
  readonly source: LiteratureSourceIdentity & { readonly providerKey: "crossref" };
};

type CrossrefCallContext = {
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export type CrossrefSearchInput = CrossrefCallContext & {
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type CrossrefSearchResult = {
  readonly records: readonly CrossrefNormalizedWork[];
  readonly nextCursor: string | null;
};

export type CrossrefSeedInput = CrossrefCallContext & {
  readonly recordKey: string;
};

export type CrossrefDoiInput = CrossrefCallContext & {
  readonly doi: string;
};

export type CrossrefAdapter = {
  readonly search: (input: CrossrefSearchInput) => Promise<CrossrefSearchResult>;
  readonly fetchSeed: (input: CrossrefSeedInput) => Promise<CrossrefNormalizedWork>;
  readonly lookupDoi: (input: CrossrefDoiInput) => Promise<CrossrefNormalizedWork>;
};

export type CrossrefAdapterDependencies = {
  readonly rateGate?: LiteratureProviderRateGate;
  readonly rateGateDependencies?: LiteratureRateGateDependencies;
  readonly transport?: LiteratureProviderTransportDependencies;
};

export type CrossrefAdapterConfig = CrossrefProviderConfig;
