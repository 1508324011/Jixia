import type { LiteratureProviderKey } from "@jixia/shared";
import { z } from "zod";

import { LiteratureProviderError } from "./provider-errors.js";

export type OpenAlexProviderConfig = {
  readonly providerKey: "openalex";
  readonly apiKey: string;
};

export type CrossrefProviderConfig = {
  readonly providerKey: "crossref";
  readonly mailto: string;
};

export type NcbiProviderConfig = {
  readonly providerKey: "pubmed" | "pmc";
  readonly apiKey: string;
  readonly tool: string;
  readonly email: string;
};

export type UnpaywallProviderConfig = {
  readonly providerKey: "unpaywall";
  readonly email: string;
};

export type EnabledLiteratureProviderConfig =
  | OpenAlexProviderConfig
  | CrossrefProviderConfig
  | NcbiProviderConfig
  | UnpaywallProviderConfig;

export type LiteratureProviderConfigState<TConfig extends EnabledLiteratureProviderConfig> =
  | { readonly status: "enabled"; readonly config: TConfig }
  | { readonly status: "disabled"; readonly providerKey: TConfig["providerKey"] };

export type LiteratureProviderConfig = {
  readonly providers: {
    readonly openalex: LiteratureProviderConfigState<OpenAlexProviderConfig>;
    readonly crossref: LiteratureProviderConfigState<CrossrefProviderConfig>;
    readonly pubmed: LiteratureProviderConfigState<NcbiProviderConfig & { readonly providerKey: "pubmed" }>;
    readonly pmc: LiteratureProviderConfigState<NcbiProviderConfig & { readonly providerKey: "pmc" }>;
    readonly unpaywall: LiteratureProviderConfigState<UnpaywallProviderConfig>;
  };
  readonly cursor:
    | { readonly status: "enabled"; readonly secret: string }
    | { readonly status: "disabled" };
};

export type LiteratureProviderEnvironment = Readonly<Record<string, string | undefined>>;

const requiredValue = z.string().trim().min(1);
const requiredEmail = z.string().trim().pipe(z.email());
const openAlexEnvironmentSchema = z.object({ OPENALEX_API_KEY: requiredValue });
const crossrefEnvironmentSchema = z.object({ CROSSREF_MAILTO: requiredEmail });
const ncbiEnvironmentSchema = z.object({
  NCBI_API_KEY: requiredValue,
  NCBI_TOOL: requiredValue,
  NCBI_EMAIL: requiredEmail
});
const unpaywallEnvironmentSchema = z.object({ UNPAYWALL_EMAIL: requiredEmail });
const cursorEnvironmentSchema = z.object({
  LITERATURE_CURSOR_SECRET: z.string().refine(
    (value) => new TextEncoder().encode(value).byteLength >= 32
  )
});

function disabled<TProviderKey extends LiteratureProviderKey>(providerKey: TProviderKey) {
  return { status: "disabled", providerKey } as const;
}

export function loadLiteratureProviderConfig(
  env: LiteratureProviderEnvironment
): LiteratureProviderConfig {
  const openAlex = openAlexEnvironmentSchema.safeParse(env);
  const crossref = crossrefEnvironmentSchema.safeParse(env);
  const ncbi = ncbiEnvironmentSchema.safeParse(env);
  const unpaywall = unpaywallEnvironmentSchema.safeParse(env);
  const cursor = cursorEnvironmentSchema.safeParse(env);

  return {
    providers: {
      openalex: openAlex.success
        ? {
          status: "enabled",
          config: { providerKey: "openalex", apiKey: openAlex.data.OPENALEX_API_KEY }
        }
        : disabled("openalex"),
      crossref: crossref.success
        ? {
          status: "enabled",
          config: { providerKey: "crossref", mailto: crossref.data.CROSSREF_MAILTO }
        }
        : disabled("crossref"),
      pubmed: ncbi.success
        ? {
          status: "enabled",
          config: {
            providerKey: "pubmed",
            apiKey: ncbi.data.NCBI_API_KEY,
            tool: ncbi.data.NCBI_TOOL,
            email: ncbi.data.NCBI_EMAIL
          }
        }
        : disabled("pubmed"),
      pmc: ncbi.success
        ? {
          status: "enabled",
          config: {
            providerKey: "pmc",
            apiKey: ncbi.data.NCBI_API_KEY,
            tool: ncbi.data.NCBI_TOOL,
            email: ncbi.data.NCBI_EMAIL
          }
        }
        : disabled("pmc"),
      unpaywall: unpaywall.success
        ? {
          status: "enabled",
          config: { providerKey: "unpaywall", email: unpaywall.data.UNPAYWALL_EMAIL }
        }
        : disabled("unpaywall")
    },
    cursor: cursor.success
      ? { status: "enabled", secret: cursor.data.LITERATURE_CURSOR_SECRET }
      : { status: "disabled" }
  };
}

export function requireLiteratureProviderConfig<TConfig extends EnabledLiteratureProviderConfig>(
  state: LiteratureProviderConfigState<TConfig>,
  action: string
): TConfig {
  if (state.status === "enabled") {
    return state.config;
  }
  throw new LiteratureProviderError({
    providerKey: state.providerKey,
    action,
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "provider_unconfigured"
  });
}
