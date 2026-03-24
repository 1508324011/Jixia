import type { ImportSourceType } from './library';

export type DiscoverySourceType = Exclude<ImportSourceType, 'upload'>;
export type DiscoveryObjectType = 'external-candidate';
export type DiscoveryItemState = 'new' | 'imported';

export interface TodayRecommendation {
  abstractText?: string;
  canonicalId: string;
  id: string;
  imported: boolean;
  objectType: DiscoveryObjectType;
  reason: string;
  sourceLabel: string;
  sourceLocator: string;
  sourceType: DiscoverySourceType;
  state: DiscoveryItemState;
  title: string;
}

export interface DiscoveryBoard {
  description?: string;
  id: string;
  items: TodayRecommendation[];
  laneLabel?: string;
  title: string;
}

export interface DiscoveryTodayResponse {
  boards: DiscoveryBoard[];
  items: TodayRecommendation[];
}

export interface DiscoverySearchResponse {
  boards: DiscoveryBoard[];
  items: TodayRecommendation[];
  query: string;
}

export const discoveryContract = 'jixia-discovery-contract';
