import { isCanonicalLiteratureDoi } from "../../literature.normalization.js";
import { isCanonicalPubmedRecordKey } from "../provider-identities.js";
import { createLiteratureProviderTransport } from "../provider-transport.js";
import type {
  LiteratureProviderRateGate,
  LiteratureProviderTransportDependencies
} from "../provider-types.js";
import { rejectedNcbiRequest } from "./ncbi.errors.js";
import { fetchPubMedArticle } from "./ncbi.pubmed-fetch.js";
import {
  resolvePubMedDoi,
  searchPubMed
} from "./ncbi.pubmed-search.js";
import {
  buildPubMedRequest,
  pubMedOrigin,
  type PubMedRequest
} from "./ncbi.request.js";
import type {
  NcbiServiceConfig,
  PubMedAdapter,
  PubMedDoiInput,
  PubMedNormalizedArticle,
  PubMedSeedInput
} from "./ncbi.types.js";

type BoundNcbiDependencies = {
  readonly rateGate: LiteratureProviderRateGate;
  readonly transport?: LiteratureProviderTransportDependencies;
};

export function createPubMedAdapter(
  config: NcbiServiceConfig,
  dependencies: BoundNcbiDependencies
): PubMedAdapter {
  const transport = createLiteratureProviderTransport<PubMedRequest>({
    providerKey: "pubmed",
    origin: pubMedOrigin,
    rateGate: dependencies.rateGate,
    buildRequest: (request) => buildPubMedRequest(config, request)
  }, dependencies.transport);

  return {
    search: (input) => searchPubMed(transport, input),
    fetchSeed: (input) => fetchPubMedSeed(transport, input),
    lookupDoi: (input) => lookupPubMedDoi(transport, input)
  };
}

async function fetchPubMedSeed(
  transport: ReturnType<typeof createLiteratureProviderTransport<PubMedRequest>>,
  input: PubMedSeedInput
): Promise<PubMedNormalizedArticle> {
  if (!isCanonicalPubmedRecordKey(input.recordKey)) {
    throw rejectedNcbiRequest("pubmed", "fetch_seed");
  }
  return fetchPubMedArticle(transport, {
    action: "fetch_seed",
    pmid: input.recordKey,
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
}

async function lookupPubMedDoi(
  transport: ReturnType<typeof createLiteratureProviderTransport<PubMedRequest>>,
  input: PubMedDoiInput
): Promise<PubMedNormalizedArticle> {
  if (!isCanonicalLiteratureDoi(input.doi)) {
    throw rejectedNcbiRequest("pubmed", "doi_lookup");
  }
  const pmid = await resolvePubMedDoi(transport, input);
  return fetchPubMedArticle(transport, {
    action: "doi_lookup",
    pmid,
    expectedDoi: input.doi,
    operationDeadlineMs: input.operationDeadlineMs,
    ...(input.signal === undefined ? {} : { signal: input.signal })
  });
}
