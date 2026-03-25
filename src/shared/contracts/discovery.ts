import type { ImportSourceType } from './library';

export type DiscoverySourceType = Exclude<ImportSourceType, 'upload'>;
export type DiscoveryObjectType = 'external-candidate';
export type DiscoveryItemState = 'new' | 'imported';

export const DEFAULT_DISCOVERY_PAGE = 1;
export const DEFAULT_DISCOVERY_PAGE_SIZE = 10;
export const MAX_DISCOVERY_PAGE_SIZE = 25;

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

export interface DiscoverySearchRequest {
  page?: number;
  pageSize?: number;
  query: string;
}

export interface DiscoverySearchResponse {
  boards: DiscoveryBoard[];
  hasNextPage: boolean;
  items: TodayRecommendation[];
  page: number;
  pageSize: number;
  query: string;
  total: number;
}

export const discoveryContract = 'jixia-discovery-contract';
