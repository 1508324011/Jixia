import type { DiscoverySourceType, TodayRecommendation } from '@shared/contracts/discovery';

export interface ImportedPaperMetadata {
  abstractText?: string;
  canonicalId: string;
  title: string;
}

export interface PubmedDiscoveryRecord
  extends Omit<TodayRecommendation, 'id' | 'imported'> {
  sourceType: DiscoverySourceType;
}

export interface PubmedConnector {
  lookup(locator: string, sourceType: 'doi' | 'pmid'): Promise<ImportedPaperMetadata>;
  search(query: string): Promise<PubmedDiscoveryRecord[]>;
}

const PUBMED_EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';

const fallbackDiscoveryRecords: PubmedDiscoveryRecord[] = [
  {
    abstractText:
      'Biomarker-driven tumor board reviews need fast evidence triage before project handoff.',
    canonicalId: 'pmid:654321',
    reason: 'Useful for today\'s tumor-board biomarker review queue.',
    sourceLabel: 'PubMed',
    sourceLocator: '654321',
    sourceType: 'pmid',
    title: 'Tumor board biomarkers for rapid review',
  },
  {
    abstractText:
      'Shared multidisciplinary review loops benefit from explicit evidence curation and import ownership.',
    canonicalId: 'pmid:123456',
    reason: 'Matches the shared review flow already demonstrated in the workbench.',
    sourceLabel: 'PubMed',
    sourceLocator: '123456',
    sourceType: 'pmid',
    title: 'Signal pathways in shared tumor boards',
  },
  {
    abstractText:
      'Clinical literature triage improves when import, annotation, and synthesis stay in one browser workflow.',
    canonicalId: 'pmid:789012',
    reason: 'Strong fit for a personal-library-first literature import lane.',
    sourceLabel: 'PubMed',
    sourceLocator: '789012',
    sourceType: 'pmid',
    title: 'Personal literature triage for governed oncology workflows',
  },
];

interface PubmedESearchResponse {
  esearchresult?: {
    idlist?: string[];
  };
}

interface PubmedESummaryEntry {
  title?: string;
}

interface PubmedESummaryResponse {
  result?: {
    uids?: string[];
    [key: string]: PubmedESummaryEntry | string[] | undefined;
  };
}

function buildFallbackLookup(locator: string, sourceType: 'doi' | 'pmid'): ImportedPaperMetadata {
  return {
    abstractText: `Imported ${sourceType.toUpperCase()} metadata for ${locator}`,
    canonicalId: `${sourceType}:${locator}`,
    title: `Imported ${sourceType.toUpperCase()} paper ${locator}`,
  };
}

function buildFallbackSearch(query: string): PubmedDiscoveryRecord[] {
  const searchTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const matches = fallbackDiscoveryRecords.filter((record) => {
    if (searchTerms.length === 0) {
      return true;
    }

    const haystack = `${record.title} ${record.abstractText ?? ''} ${record.reason}`.toLowerCase();

    return searchTerms.every((term) => haystack.includes(term));
  });

  return (matches.length > 0 ? matches : fallbackDiscoveryRecords).slice(0, 5);
}

function mapSummaryToDiscoveryRecord(
  pmid: string,
  summary: PubmedESummaryEntry | undefined,
  query: string,
): PubmedDiscoveryRecord {
  return {
    abstractText: `PubMed result for ${query}`,
    canonicalId: `pmid:${pmid}`,
    reason: `PubMed matched “${query}”.`,
    sourceLabel: 'PubMed',
    sourceLocator: pmid,
    sourceType: 'pmid',
    title: summary?.title?.trim() || `PubMed result ${pmid}`,
  };
}

async function fetchPubmedJson<T>(pathname: string, params: Record<string, string>): Promise<T> {
  const requestUrl = new URL(pathname, PUBMED_EUTILS_BASE);

  Object.entries(params).forEach(([key, value]) => {
    requestUrl.searchParams.set(key, value);
  });

  const response = await fetch(requestUrl);

  if (!response.ok) {
    throw new Error(`PubMed request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchSummaryByPmids(pmids: string[], query: string): Promise<PubmedDiscoveryRecord[]> {
  if (pmids.length === 0) {
    return [];
  }

  const summaryResponse = await fetchPubmedJson<PubmedESummaryResponse>('esummary.fcgi', {
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'json',
  });
  const summaries = summaryResponse.result;

  return pmids.map((pmid) =>
    mapSummaryToDiscoveryRecord(
      pmid,
      summaries?.[pmid] as PubmedESummaryEntry | undefined,
      query,
    ),
  );
}

async function searchLivePubmed(query: string): Promise<PubmedDiscoveryRecord[]> {
  const searchResponse = await fetchPubmedJson<PubmedESearchResponse>('esearch.fcgi', {
    db: 'pubmed',
    retmax: '5',
    retmode: 'json',
    sort: 'relevance',
    term: query,
  });

  return fetchSummaryByPmids(searchResponse.esearchresult?.idlist ?? [], query);
}

async function lookupLivePubmed(locator: string, sourceType: 'doi' | 'pmid'): Promise<ImportedPaperMetadata> {
  if (sourceType === 'pmid') {
    const [record] = await fetchSummaryByPmids([locator], locator);

    return {
      abstractText: record?.abstractText,
      canonicalId: record?.canonicalId ?? `pmid:${locator}`,
      title: record?.title ?? `Imported PMID paper ${locator}`,
    };
  }

  const searchResponse = await fetchPubmedJson<PubmedESearchResponse>('esearch.fcgi', {
    db: 'pubmed',
    retmax: '1',
    retmode: 'json',
    term: `${locator}[DOI]`,
  });
  const resolvedPmid = searchResponse.esearchresult?.idlist?.[0];

  if (!resolvedPmid) {
    throw new Error(`PubMed could not resolve DOI ${locator}`);
  }

  const [record] = await fetchSummaryByPmids([resolvedPmid], locator);

  return {
    abstractText: record?.abstractText,
    canonicalId: `doi:${locator}`,
    title: record?.title ?? `Imported DOI paper ${locator}`,
  };
}

export function createPubmedConnector(): PubmedConnector {
  return {
    async lookup(
      locator: string,
      sourceType: 'doi' | 'pmid',
    ): Promise<ImportedPaperMetadata> {
      if (sourceType === 'pmid') {
        return buildFallbackLookup(locator, sourceType);
      }

      try {
        return await lookupLivePubmed(locator, sourceType);
      } catch {
        return buildFallbackLookup(locator, sourceType);
      }
    },
    async search(query: string): Promise<PubmedDiscoveryRecord[]> {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        return [];
      }

      try {
        const liveResults = await searchLivePubmed(trimmedQuery);

        return liveResults.length > 0 ? liveResults : buildFallbackSearch(trimmedQuery);
      } catch {
        return buildFallbackSearch(trimmedQuery);
      }
    },
  };
}
