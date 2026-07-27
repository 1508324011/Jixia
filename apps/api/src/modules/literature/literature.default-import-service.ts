import { createCrossrefAdapter } from "./discovery/crossref/crossref.adapter.js";
import { createNcbiAdapters } from "./discovery/ncbi/ncbi.service.js";
import { createOpenAlexAdapter } from "./discovery/openalex/openalex.adapter.js";
import {
  loadLiteratureProviderConfig,
  type LiteratureProviderConfig
} from "./discovery/provider-config.js";
import { LiteratureProviderError } from "./discovery/provider-errors.js";
import { createUnpaywallAdapter } from "./discovery/unpaywall/unpaywall.adapter.js";
import { createPrismaLiteratureImportRepository } from "./literature.prisma-import-repository.js";
import {
  createLiteratureImportService,
  type LiteratureImportProviders,
  type LiteratureImportService
} from "./literature.import-service.js";

let defaultImportService: LiteratureImportService | null = null;

export async function getDefaultLiteratureImportService(): Promise<LiteratureImportService> {
  if (defaultImportService !== null) {
    return defaultImportService;
  }
  const { prisma } = await import("@jixia/db");
  const config = loadLiteratureProviderConfig(process.env);
  defaultImportService = createLiteratureImportService({
    repository: createPrismaLiteratureImportRepository(prisma),
    providers: createConfiguredLiteratureImportProviders(config)
  });
  return defaultImportService;
}

export function createConfiguredLiteratureImportProviders(
  config: LiteratureProviderConfig
): LiteratureImportProviders {
  const openalex = config.providers.openalex.status === "enabled"
    ? createOpenAlexAdapter(config.providers.openalex.config)
    : {
      fetchSeed: async () => { throw unconfigured("openalex", "fetch_seed"); },
      lookupDoi: async () => { throw unconfigured("openalex", "doi_lookup"); }
    };
  const crossref = config.providers.crossref.status === "enabled"
    ? createCrossrefAdapter(config.providers.crossref.config)
    : {
      fetchSeed: async () => { throw unconfigured("crossref", "fetch_seed"); },
      lookupDoi: async () => { throw unconfigured("crossref", "doi_lookup"); }
    };
  const ncbi = config.providers.pubmed.status === "enabled"
    ? createNcbiAdapters(config.providers.pubmed.config)
    : null;
  return {
    openalex,
    crossref,
    pubmed: ncbi?.pubmed ?? {
      fetchSeed: async () => { throw unconfigured("pubmed", "fetch_seed"); },
      lookupDoi: async () => { throw unconfigured("pubmed", "doi_lookup"); }
    },
    pmc: ncbi?.pmc ?? {
      lookup: async () => { throw unconfigured("pmc", "pmc_lookup"); }
    },
    unpaywall: createUnpaywallAdapter(config.providers.unpaywall)
  };
}

function unconfigured(
  providerKey: "openalex" | "crossref" | "pubmed" | "pmc",
  action: string
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey,
    action,
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "provider_unconfigured"
  });
}
