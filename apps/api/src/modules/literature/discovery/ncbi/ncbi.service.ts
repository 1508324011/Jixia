import {
  createLiteratureProviderRateGate,
  literatureRateGateDefaults
} from "../provider-rate-gate.js";
import { createPmcAdapter } from "./ncbi.pmc.js";
import { createPubMedAdapter } from "./ncbi.pubmed.js";
import type {
  NcbiAdapterDependencies,
  NcbiAdapters,
  NcbiServiceConfig
} from "./ncbi.types.js";

export type {
  NcbiAdapterDependencies,
  NcbiAdapters,
  NcbiServiceConfig,
  PmcAdapter,
  PmcLookupInput,
  PmcOpenAccessPointer,
  PmcOpenAccessResource,
  PubMedAdapter,
  PubMedDoiInput,
  PubMedNormalizedArticle,
  PubMedSearchInput,
  PubMedSearchResult,
  PubMedSeedInput
} from "./ncbi.types.js";

export function createNcbiAdapters(
  config: NcbiServiceConfig,
  dependencies: NcbiAdapterDependencies = {}
): NcbiAdapters {
  const rateGate = dependencies.rateGate ?? createLiteratureProviderRateGate(
    literatureRateGateDefaults.ncbi,
    {
      ...(dependencies.transport?.now === undefined
        ? {}
        : { now: dependencies.transport.now }),
      ...(dependencies.transport?.sleep === undefined
        ? {}
        : { sleep: dependencies.transport.sleep })
    }
  );
  const boundDependencies = {
    rateGate,
    ...(dependencies.transport === undefined
      ? {}
      : { transport: dependencies.transport })
  };
  return {
    pubmed: createPubMedAdapter(config, boundDependencies),
    pmc: createPmcAdapter(config, boundDependencies)
  };
}
