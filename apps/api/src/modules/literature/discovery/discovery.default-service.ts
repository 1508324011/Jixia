import { createLiteratureCursorCodec } from "./cursor-codec.js";
import { createCrossrefAdapter } from "./crossref/crossref.adapter.js";
import { createLiteratureDiscoveryService } from "./discovery.service.js";
import {
  LiteratureDiscoveryError,
  type LiteratureDiscoverySearchAdapter,
  type LiteratureDiscoveryService
} from "./discovery.types.js";
import { createNcbiAdapters } from "./ncbi/ncbi.service.js";
import { createOpenAlexAdapter } from "./openalex/openalex.adapter.js";
import {
  loadLiteratureProviderConfig,
  type CrossrefProviderConfig,
  type LiteratureProviderConfigState,
  type NcbiProviderConfig,
  type OpenAlexProviderConfig
} from "./provider-config.js";
import { LiteratureProviderError } from "./provider-errors.js";

type SearchProviderConfig =
  | OpenAlexProviderConfig
  | CrossrefProviderConfig
  | (NcbiProviderConfig & { readonly providerKey: "pubmed" });

let defaultDiscoveryService: LiteratureDiscoveryService | null = null;

export function getDefaultLiteratureDiscoveryService(): LiteratureDiscoveryService {
  if (defaultDiscoveryService !== null) {
    return defaultDiscoveryService;
  }
  const config = loadLiteratureProviderConfig(process.env);
  if (config.cursor.status === "disabled") {
    throw new LiteratureDiscoveryError("discovery_unconfigured", 503);
  }
  const adapters = {
    openalex: createConfiguredAdapter(
      config.providers.openalex,
      (providerConfig) => createOpenAlexAdapter(providerConfig)
    ),
    crossref: createConfiguredAdapter(
      config.providers.crossref,
      (providerConfig) => createCrossrefAdapter(providerConfig)
    ),
    pubmed: createConfiguredAdapter(
      config.providers.pubmed,
      (providerConfig) => createNcbiAdapters({
        apiKey: providerConfig.apiKey,
        tool: providerConfig.tool,
        email: providerConfig.email
      }).pubmed
    )
  };
  defaultDiscoveryService = createLiteratureDiscoveryService({
    adapters,
    cursorCodec: createLiteratureCursorCodec({ secret: config.cursor.secret })
  });
  return defaultDiscoveryService;
}

function createConfiguredAdapter<TConfig extends SearchProviderConfig>(
  state: LiteratureProviderConfigState<TConfig>,
  create: (config: TConfig) => LiteratureDiscoverySearchAdapter
): LiteratureDiscoverySearchAdapter {
  switch (state.status) {
    case "enabled":
      return create(state.config);
    case "disabled":
      return {
        async search() {
          throw new LiteratureProviderError({
            providerKey: state.providerKey,
            action: "search",
            attempt: 0,
            statusClass: null,
            latencyMs: 0,
            code: "provider_unconfigured"
          });
        }
      };
  }
}
