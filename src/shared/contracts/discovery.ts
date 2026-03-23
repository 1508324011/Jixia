import type { ImportSourceType } from './library';

export type DiscoverySourceType = Exclude<ImportSourceType, 'upload'>;

export interface TodayRecommendation {
  abstractText?: string;
  canonicalId: string;
  id: string;
  imported: boolean;
  reason: string;
  sourceLabel: string;
  sourceLocator: string;
  sourceType: DiscoverySourceType;
  title: string;
}

export interface DiscoveryTodayResponse {
  items: TodayRecommendation[];
}

export interface DiscoverySearchResponse {
  items: TodayRecommendation[];
  query: string;
}

export const discoveryContract = 'jixia-discovery-contract';
