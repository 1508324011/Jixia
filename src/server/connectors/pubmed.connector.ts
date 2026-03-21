export interface ImportedPaperMetadata {
  abstractText?: string;
  canonicalId: string;
  title: string;
}

export interface PubmedConnector {
  lookup(locator: string, sourceType: 'doi' | 'pmid'): Promise<ImportedPaperMetadata>;
}

export function createPubmedConnector(): PubmedConnector {
  return {
    async lookup(
      locator: string,
      sourceType: 'doi' | 'pmid',
    ): Promise<ImportedPaperMetadata> {
      return {
        abstractText: `Imported ${sourceType.toUpperCase()} metadata for ${locator}`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Imported ${sourceType.toUpperCase()} paper ${locator}`,
      };
    },
  };
}
