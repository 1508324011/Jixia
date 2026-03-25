import {
  DEFAULT_DISCOVERY_PAGE,
  DEFAULT_DISCOVERY_PAGE_SIZE,
  MAX_DISCOVERY_PAGE_SIZE,
} from '@shared/contracts/discovery';
import type { DiscoverySearchRequest, TodayRecommendation } from '@shared/contracts/discovery';

import type { ArxivConnector } from '../connectors/arxiv.connector';
import type { BiorxivConnector } from '../connectors/biorxiv.connector';
import type { OpenalexConnector } from '../connectors/openalex.connector';
import type {
  DiscoveryConnectorResult,
  PubmedConnector,
} from '../connectors/pubmed.connector';

export interface StoredDiscoveryCandidate extends TodayRecommendation {
  lastQuery: string;
}

export interface DiscoveryStore {
  arxivConnector: ArxivConnector;
  biorxivConnector: BiorxivConnector;
  discoveryCandidates: StoredDiscoveryCandidate[];
  nextId(prefix: string): string;
  openalexConnector: OpenalexConnector;
  persist(): void;
  pubmedConnector: PubmedConnector;
}

export interface PaginatedDiscoverySearchResult {
  hasNextPage: boolean;
  items: TodayRecommendation[];
  page: number;
  pageSize: number;
  query: string;
  total: number;
}

export interface DiscoveryService {
  getCandidate(candidateId: string): StoredDiscoveryCandidate | null;
  search(query: string): Promise<TodayRecommendation[]>;
  searchPage(input: DiscoverySearchRequest): Promise<PaginatedDiscoverySearchResult>;
}

function candidateKey(candidate: DiscoveryConnectorResult): string {
  return `${candidate.sourceLabel}:${candidate.canonicalId}:${candidate.sourceLocator}`;
}

function normalizeCandidate(
  existingCandidate: StoredDiscoveryCandidate | undefined,
  candidate: DiscoveryConnectorResult,
  lastQuery: string,
  nextId: (prefix: string) => string,
): StoredDiscoveryCandidate {
  return {
    abstractText: candidate.abstractText,
    canonicalId: candidate.canonicalId,
    id: existingCandidate?.id ?? nextId('candidate'),
    imported: false,
    lastQuery,
    objectType: 'external-candidate',
    reason: candidate.reason,
    sourceLabel: candidate.sourceLabel,
    sourceLocator: candidate.sourceLocator,
    sourceType: candidate.sourceType,
    state: 'new',
    title: candidate.title,
  };
}

export function createDiscoveryService(store: DiscoveryStore): DiscoveryService {
  async function searchAll(query: string): Promise<TodayRecommendation[]> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return [];
    }

    const connectorResults = await Promise.all([
      store.pubmedConnector.search(trimmedQuery),
      store.arxivConnector.search(trimmedQuery),
      store.openalexConnector.search(trimmedQuery),
      store.biorxivConnector.search(trimmedQuery),
    ]);
    const flattenedResults = connectorResults.flat();
    const existingCandidates = new Map(
      store.discoveryCandidates.map((candidate) => [candidateKey(candidate), candidate]),
    );
    const normalizedCandidates = flattenedResults.map((candidate) =>
      normalizeCandidate(
        existingCandidates.get(candidateKey(candidate)),
        candidate,
        trimmedQuery,
        store.nextId,
      ),
    );

    for (const candidate of normalizedCandidates) {
      const existingIndex = store.discoveryCandidates.findIndex(
        (existingCandidate) => existingCandidate.id === candidate.id,
      );

      if (existingIndex >= 0) {
        store.discoveryCandidates.splice(existingIndex, 1, candidate);
      } else {
        store.discoveryCandidates.push(candidate);
      }
    }

    if (normalizedCandidates.length > 0) {
      store.persist();
    }

    return normalizedCandidates;
  }

  function normalizePage(page?: number): number {
    if (typeof page !== 'number' || !Number.isFinite(page)) {
      return DEFAULT_DISCOVERY_PAGE;
    }

    return Math.max(DEFAULT_DISCOVERY_PAGE, Math.floor(page));
  }

  function normalizePageSize(pageSize?: number): number {
    if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) {
      return DEFAULT_DISCOVERY_PAGE_SIZE;
    }

    return Math.min(
      MAX_DISCOVERY_PAGE_SIZE,
      Math.max(DEFAULT_DISCOVERY_PAGE, Math.floor(pageSize)),
    );
  }

  return {
    getCandidate(candidateId: string): StoredDiscoveryCandidate | null {
      return store.discoveryCandidates.find((candidate) => candidate.id === candidateId) ?? null;
    },
    async search(query: string): Promise<TodayRecommendation[]> {
      return searchAll(query);
    },
    async searchPage(input: DiscoverySearchRequest): Promise<PaginatedDiscoverySearchResult> {
      const query = input.query.trim();
      const page = normalizePage(input.page);
      const pageSize = normalizePageSize(input.pageSize);

      if (!query) {
        return {
          hasNextPage: false,
          items: [],
          page,
          pageSize,
          query,
          total: 0,
        };
      }

      const items = await searchAll(query);
      const startIndex = (page - 1) * pageSize;
      const pagedItems = items.slice(startIndex, startIndex + pageSize);

      return {
        hasNextPage: startIndex + pageSize < items.length,
        items: pagedItems,
        page,
        pageSize,
        query,
        total: items.length,
      };
    },
  };
}
