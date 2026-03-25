import type { DiscoveryConnectorResult } from './pubmed.connector';

export interface OpenalexConnector {
  search(query: string): Promise<DiscoveryConnectorResult[]>;
}

const fallbackDiscoveryRecords: DiscoveryConnectorResult[] = [
  {
    abstractText:
      'Tumor board project teams need durable import boundaries so recommendation candidates do not masquerade as owned inventory.',
    canonicalId: 'doi:10.1101/2024.01.01.123456',
    reason: 'OpenAlex-style discovery signal for tumor board import-boundary validation.',
    sourceLabel: 'OpenAlex',
    sourceLocator: '10.1101/2024.01.01.123456',
    sourceType: 'doi',
    title: 'Import boundaries for governed tumor board workbenches',
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

export function createOpenalexConnector(): OpenalexConnector {
  return {
    async search(query: string): Promise<DiscoveryConnectorResult[]> {
      return buildFallbackSearch(query);
    },
  };
}
