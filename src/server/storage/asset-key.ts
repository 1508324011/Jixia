import { posix } from 'node:path';

function normalizeSeparators(input: string): string {
  return input.replaceAll('\\', '/');
}

function ensureRelativeStorageKey(input: string): string {
  const candidate = normalizeSeparators(input).trim();

  if (!candidate || posix.isAbsolute(candidate)) {
    throw new Error('Asset storage key must be a relative storage key.');
  }

  const normalized = posix.normalize(candidate).replace(/^\.\//, '');

  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error('Asset storage key must be a relative storage key.');
  }

  return normalized;
}

export function toAssetStorageKey(input: string): string {
  return ensureRelativeStorageKey(input);
}

export function createPaperPdfStorageKey(assetId: string): string {
  return toAssetStorageKey(`papers/${assetId}/paper.pdf`);
}

export function createPaperExtractedTextStorageKey(assetId: string): string {
  return toAssetStorageKey(`papers/${assetId}/extracted.txt`);
}
