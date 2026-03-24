import type { DiscoveryConnectorResult } from './pubmed.connector';

export interface BiorxivConnector {
  search(query: string): Promise<DiscoveryConnectorResult[]>;
}

const fallbackDiscoveryRecords: DiscoveryConnectorResult[] = [
  {
    abstractText:
      'bioRxiv discovery should surface preprints without silently converting them into project-owned evidence.',
    canonicalId: 'doi:10.1101/2024.02.02.234567',
    reason: 'bioRxiv preprint connector scaffold for the intake lane.',
    sourceLabel: 'bioRxiv',
    sourceLocator: '10.1101/2024.02.02.234567',
    sourceType: 'doi',
    title: 'Preprint intake for evidence-governed reading workbenches',
  },
];

function buildFallbackSearch(query: string): DiscoveryConnectorResult[] {
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery) {
    return [];
  }

  const matches = fallbackDiscoveryRecords.filter((record) => {
    const haystack = `${record.title} ${record.abstractText ?? ''} ${record.reason}`.toLowerCase();

    return trimmedQuery
      .split(/\s+/)
      .filter(Boolean)
      .every((term) => haystack.includes(term));
  });

  return matches.length > 0 ? matches : fallbackDiscoveryRecords;
}

export function createBiorxivConnector(): BiorxivConnector {
  return {
    async search(query: string): Promise<DiscoveryConnectorResult[]> {
      return buildFallbackSearch(query);
    },
  };
}
