import type {
  LiteratureOpenAccessValue,
  LiteraturePublisherValue,
  LiteratureSourceIdentity
} from "@jixia/shared";

import type {
  LiteratureProviderConfigState,
  UnpaywallProviderConfig
} from "../provider-config.js";
import type {
  LiteratureProviderRateGate,
  LiteratureProviderTransportDependencies
} from "../provider-types.js";

type UnpaywallCallContext = {
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export type UnpaywallEnrichmentInput = UnpaywallCallContext & {
  readonly doi: string;
};

export type UnpaywallEnrichment = {
  readonly source: LiteratureSourceIdentity & { readonly providerKey: "unpaywall" };
  readonly doi: string;
  readonly openAccess: LiteratureOpenAccessValue;
  readonly publisher: LiteraturePublisherValue;
};

export type UnpaywallAdapter = {
  readonly enrichDoi: (input: UnpaywallEnrichmentInput) => Promise<UnpaywallEnrichment>;
};

export type UnpaywallAdapterDependencies = {
  readonly rateGate?: LiteratureProviderRateGate;
  readonly transport?: LiteratureProviderTransportDependencies;
};

export type UnpaywallAdapterConfigState = LiteratureProviderConfigState<UnpaywallProviderConfig>;
