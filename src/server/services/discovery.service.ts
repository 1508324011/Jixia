import type { TodayRecommendation } from '@shared/contracts/discovery';

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

export interface DiscoveryService {
  getCandidate(candidateId: string): StoredDiscoveryCandidate | null;
  search(query: string): Promise<TodayRecommendation[]>;
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
  return {
    getCandidate(candidateId: string): StoredDiscoveryCandidate | null {
      return store.discoveryCandidates.find((candidate) => candidate.id === candidateId) ?? null;
    },
    async search(query: string): Promise<TodayRecommendation[]> {
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
    },
  };
}
