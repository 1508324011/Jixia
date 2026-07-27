import type {
  LiteratureDiscoveryCandidateDTO,
  LiteratureOpenAccessValue,
  LiteratureSourceIdentity
} from "@jixia/shared";

import type { NcbiProviderConfig } from "../provider-config.js";
import type {
  LiteratureProviderRateGate,
  LiteratureProviderTransportDependencies
} from "../provider-types.js";

export type PubMedNormalizedArticle = Omit<
  LiteratureDiscoveryCandidateDTO,
  "sourceMatches"
> & {
  readonly source: LiteratureSourceIdentity & { readonly providerKey: "pubmed" };
};

type NcbiCallContext = {
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export type PubMedSearchInput = NcbiCallContext & {
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type PubMedSearchResult = {
  readonly records: readonly PubMedNormalizedArticle[];
  readonly nextCursor: string | null;
};

export type PubMedSeedInput = NcbiCallContext & {
  readonly recordKey: string;
};

export type PubMedDoiInput = NcbiCallContext & {
  readonly doi: string;
};

export type PubMedAdapter = {
  readonly search: (input: PubMedSearchInput) => Promise<PubMedSearchResult>;
  readonly fetchSeed: (input: PubMedSeedInput) => Promise<PubMedNormalizedArticle>;
  readonly lookupDoi: (input: PubMedDoiInput) => Promise<PubMedNormalizedArticle>;
};

export type PmcOpenAccessResource = {
  readonly format: "pdf" | "tgz";
  readonly updated: string;
  readonly href: string;
};

export type PmcOpenAccessPointer = {
  readonly source: LiteratureSourceIdentity & { readonly providerKey: "pmc" };
  readonly openAccess: LiteratureOpenAccessValue;
  readonly resources: readonly PmcOpenAccessResource[];
};

export type PmcLookupInput = NcbiCallContext & {
  readonly pmcid: string;
};

export type PmcAdapter = {
  readonly lookup: (input: PmcLookupInput) => Promise<PmcOpenAccessPointer | null>;
};

export type NcbiAdapters = {
  readonly pubmed: PubMedAdapter;
  readonly pmc: PmcAdapter;
};

export type NcbiServiceConfig = Pick<NcbiProviderConfig, "apiKey" | "tool" | "email">;

export type NcbiAdapterDependencies = {
  readonly rateGate?: LiteratureProviderRateGate;
  readonly transport?: LiteratureProviderTransportDependencies;
};
