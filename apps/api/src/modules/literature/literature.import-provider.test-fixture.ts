import type {
  LiteratureImportWarningCode,
  LiteratureProviderKey
} from "@jixia/shared";

import type { CrossrefNormalizedWork } from "./discovery/crossref/crossref.types.js";
import type {
  PmcOpenAccessPointer,
  PubMedNormalizedArticle
} from "./discovery/ncbi/ncbi.types.js";
import type { OpenAlexNormalizedWork } from "./discovery/openalex/openalex.types.js";
import {
  LiteratureProviderError,
  type LiteratureProviderErrorCode
} from "./discovery/provider-errors.js";
import type { UnpaywallEnrichment } from "./discovery/unpaywall/unpaywall.types.js";
import type { LiteratureImportProviders } from "./literature.import-service.js";

export const fixtureDoi = "10.1000/import-fixture";

export const openAlexFixtureWork: OpenAlexNormalizedWork = {
  source: { providerKey: "openalex", recordKey: "W1" },
  title: "OpenAlex title",
  abstract: "OpenAlex abstract",
  publicationYear: 2026,
  publicationDate: "2026-07-20",
  venue: "OpenAlex Venue",
  publicationType: "article",
  doi: fixtureDoi,
  authors: [{ displayName: "Open Author", orcid: "0000-0001-0000-0001" }],
  identifiers: [
    { scheme: "doi", value: fixtureDoi },
    { scheme: "openalex", value: "W1" }
  ],
  openAccess: { isOpenAccess: true, hostType: "publisher" },
  publisher: { name: "Open Publisher" }
};

export const crossrefFixtureWork: CrossrefNormalizedWork = {
  source: { providerKey: "crossref", recordKey: fixtureDoi },
  title: "Crossref title",
  abstract: "Crossref abstract",
  publicationYear: 2026,
  publicationDate: "2026-07-19",
  venue: "Crossref Venue",
  publicationType: "journal-article",
  doi: fixtureDoi,
  authors: [{ displayName: "Cross Author" }],
  identifiers: [{ scheme: "doi", value: fixtureDoi }],
  openAccess: null,
  publisher: { name: "Cross Publisher" }
};

export const pubmedFixtureWork: PubMedNormalizedArticle = {
  source: { providerKey: "pubmed", recordKey: "42" },
  title: "PubMed title",
  abstract: "PubMed abstract",
  publicationYear: 2026,
  publicationDate: "2026-07-18",
  venue: "PubMed Venue",
  publicationType: "Journal Article",
  doi: fixtureDoi,
  authors: [{ displayName: "PubMed Author" }],
  identifiers: [
    { scheme: "doi", value: fixtureDoi },
    { scheme: "pmid", value: "42" },
    { scheme: "pmcid", value: "PMC42" }
  ],
  openAccess: null,
  publisher: null
};

export const pubmedNoDoiFixtureWork: PubMedNormalizedArticle = {
  ...pubmedFixtureWork,
  doi: null,
  identifiers: [{ scheme: "pmid", value: "42" }]
};

export const unpaywallFixtureEnrichment: UnpaywallEnrichment = {
  source: { providerKey: "unpaywall", recordKey: fixtureDoi },
  doi: fixtureDoi,
  openAccess: {
    isOpenAccess: true,
    bestUrl: "https://repository.example.test/article",
    license: "cc-by",
    version: "accepted",
    hostType: "repository"
  },
  publisher: {
    name: "Fixture Publisher",
    landingPageUrl: "https://publisher.example.test/article"
  }
};

export const pmcFixturePointer: PmcOpenAccessPointer = {
  source: { providerKey: "pmc", recordKey: "PMC42" },
  openAccess: {
    isOpenAccess: true,
    bestUrl: "https://pmc.example.test/articles/PMC42",
    license: "cc-by",
    version: "published",
    hostType: "repository"
  },
  resources: [
    {
      format: "pdf",
      updated: "2026-07-20T00:00:00Z",
      href: "https://pmc.example.test/articles/PMC42/pdf"
    }
  ]
};

export class FixtureImportProviders {
  openAlexSeed = openAlexFixtureWork;
  crossrefSeed = crossrefFixtureWork;
  pubmedSeed = pubmedFixtureWork;
  openAlexDoi = openAlexFixtureWork;
  crossrefDoi = crossrefFixtureWork;
  pubmedDoi = pubmedFixtureWork;
  unpaywall = unpaywallFixtureEnrichment;
  pmc: PmcOpenAccessPointer | null = pmcFixturePointer;
  openAlexSeedError: Error | null = null;
  crossrefSeedError: Error | null = null;
  pubmedSeedError: Error | null = null;
  openAlexDoiError: Error | null = null;
  crossrefDoiError: Error | null = null;
  pubmedDoiError: Error | null = null;
  unpaywallError: Error | null = null;
  pmcError: Error | null = null;
  readonly calls: string[] = [];
  readonly pmcOutcomes = new Map<string, PmcOpenAccessPointer | null | Error>();
  readonly pmcRecordKeys: string[] = [];

  readonly adapters: LiteratureImportProviders = {
    openalex: {
      fetchSeed: async () => {
        this.calls.push("openalex:seed");
        if (this.openAlexSeedError !== null) {
          throw this.openAlexSeedError;
        }
        return this.openAlexSeed;
      },
      lookupDoi: async () => {
        this.calls.push("openalex:doi");
        if (this.openAlexDoiError !== null) {
          throw this.openAlexDoiError;
        }
        return this.openAlexDoi;
      }
    },
    crossref: {
      fetchSeed: async () => {
        this.calls.push("crossref:seed");
        if (this.crossrefSeedError !== null) {
          throw this.crossrefSeedError;
        }
        return this.crossrefSeed;
      },
      lookupDoi: async () => {
        this.calls.push("crossref:doi");
        if (this.crossrefDoiError !== null) {
          throw this.crossrefDoiError;
        }
        return this.crossrefDoi;
      }
    },
    pubmed: {
      fetchSeed: async () => {
        this.calls.push("pubmed:seed");
        if (this.pubmedSeedError !== null) {
          throw this.pubmedSeedError;
        }
        return this.pubmedSeed;
      },
      lookupDoi: async () => {
        this.calls.push("pubmed:doi");
        if (this.pubmedDoiError !== null) {
          throw this.pubmedDoiError;
        }
        return this.pubmedDoi;
      }
    },
    unpaywall: {
      enrichDoi: async () => {
        this.calls.push("unpaywall:doi");
        if (this.unpaywallError !== null) {
          throw this.unpaywallError;
        }
        return this.unpaywall;
      }
    },
    pmc: {
      lookup: async (input) => {
        this.calls.push("pmc:lookup");
        this.pmcRecordKeys.push(input.pmcid);
        if (this.pmcOutcomes.has(input.pmcid)) {
          const outcome = this.pmcOutcomes.get(input.pmcid) ?? null;
          if (outcome instanceof Error) {
            throw outcome;
          }
          return outcome;
        }
        if (this.pmcError !== null) {
          throw this.pmcError;
        }
        return this.pmc === null
          ? null
          : { ...this.pmc, source: { providerKey: "pmc", recordKey: input.pmcid } };
      }
    }
  };
}

export function fixtureProviderError(
  providerKey: LiteratureProviderKey,
  code: LiteratureProviderErrorCode
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey,
    action: "fixture_call",
    attempt: 1,
    statusClass: null,
    latencyMs: 1,
    code
  });
}

export const warningForProvider = {
  openalex: "openalex_enrichment_unavailable",
  crossref: "crossref_enrichment_unavailable",
  pubmed: "pubmed_enrichment_unavailable",
  pmc: "pmc_enrichment_unavailable",
  unpaywall: "unpaywall_enrichment_unavailable"
} as const satisfies Readonly<Record<LiteratureProviderKey, LiteratureImportWarningCode>>;
