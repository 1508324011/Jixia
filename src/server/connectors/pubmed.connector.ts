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
const PUBMED_REQUEST_TIMEOUT_MS = 500;

function shouldSkipLivePubmedRequests(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

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

function mapSummaryToDiscoveryRecord(
  pmid: string,
  summary: PubmedESummaryEntry | undefined,
  query: string,
): PubmedDiscoveryRecord | null {
  const title = summary?.title?.trim();

  if (!title) {
    return null;
  }

  return {
    canonicalId: `pmid:${pmid}`,
    reason: `PubMed matched “${query}”.`,
    sourceLabel: 'PubMed',
    sourceLocator: pmid,
    sourceType: 'pmid',
    title,
  };
}

async function fetchPubmedJson<T>(pathname: string, params: Record<string, string>): Promise<T> {
  const requestUrl = new URL(pathname, PUBMED_EUTILS_BASE);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBMED_REQUEST_TIMEOUT_MS);

  Object.entries(params).forEach(([key, value]) => {
    requestUrl.searchParams.set(key, value);
  });

  try {
    const response = await fetch(requestUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`PubMed request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
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

  return (summaries?.uids ?? []).flatMap((pmid) => {
    const record = mapSummaryToDiscoveryRecord(
      pmid,
      summaries?.[pmid] as PubmedESummaryEntry | undefined,
      query,
    );

    return record ? [record] : [];
  });
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

    if (!record) {
      throw new Error(`PubMed could not resolve PMID ${locator}`);
    }

    return {
      abstractText: record?.abstractText,
      canonicalId: record.canonicalId,
      title: record.title,
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

  if (!record) {
    throw new Error(`PubMed could not summarize DOI ${locator}`);
  }

  return {
    abstractText: record?.abstractText,
    canonicalId: `doi:${locator}`,
    title: record.title,
  };
}

export function createPubmedConnector(): PubmedConnector {
  const discoveryCache = new Map<string, PubmedDiscoveryRecord[]>();

  return {
    async lookup(
      locator: string,
      sourceType: 'doi' | 'pmid',
    ): Promise<ImportedPaperMetadata> {
      if (shouldSkipLivePubmedRequests()) {
        throw new Error('PubMed live lookup is unavailable in this runtime. Use an explicit fixture connector for deterministic test records.');
      }

      return lookupLivePubmed(locator, sourceType);
    },
    async search(query: string): Promise<PubmedDiscoveryRecord[]> {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        return [];
      }

      const cachedResults = discoveryCache.get(trimmedQuery);

      if (cachedResults) {
        return cachedResults.map((record) => ({ ...record }));
      }

      if (shouldSkipLivePubmedRequests()) {
        return [];
      }

      const liveResults = await searchLivePubmed(trimmedQuery);
      discoveryCache.set(trimmedQuery, liveResults);

      return liveResults.map((record) => ({ ...record }));
    },
  };
}
