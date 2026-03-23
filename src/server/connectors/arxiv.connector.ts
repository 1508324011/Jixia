import type { ImportedPaperMetadata } from './pubmed.connector';

export interface ArxivConnector {
  lookup(locator: string): Promise<ImportedPaperMetadata>;
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
  };
}
