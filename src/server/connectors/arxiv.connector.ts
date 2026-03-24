import type { DiscoveryConnectorResult, ImportedPaperMetadata } from './pubmed.connector';

export interface ArxivConnector {
  lookup(locator: string): Promise<ImportedPaperMetadata>;
  search(query: string): Promise<DiscoveryConnectorResult[]>;
}

const fallbackDiscoveryRecords: DiscoveryConnectorResult[] = [
  {
    abstractText:
      'Preprint discovery is most useful when it remains outside the durable library until a researcher chooses to import it.',
    canonicalId: 'arxiv:2401.00001',
    reason: 'arXiv preprint relevant to governed intake experimentation.',
    sourceLabel: 'arXiv',
    sourceLocator: '2401.00001',
    sourceType: 'arxiv',
    title: 'Governed intake patterns for literature workbenches',
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

export function createArxivConnector(): ArxivConnector {
  return {
    async lookup(locator: string): Promise<ImportedPaperMetadata> {
      return {
        abstractText: `Imported arXiv metadata for ${locator}`,
        canonicalId: `arxiv:${locator}`,
        title: `Imported arXiv paper ${locator}`,
      };
    },
    async search(query: string): Promise<DiscoveryConnectorResult[]> {
      return buildFallbackSearch(query);
    },
  };
}
