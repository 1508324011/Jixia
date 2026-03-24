import type { TodayRecommendation } from '@shared/contracts/discovery';

import type { DiscoveryService } from './discovery.service';

const DEFAULT_TODAY_DISCOVERY_QUERY = 'tumor board biomarkers';

export interface RecommendationService {
  listToday(): Promise<TodayRecommendation[]>;
}

export function createRecommendationService(discoveryService: DiscoveryService): RecommendationService {
  return {
    async listToday(): Promise<TodayRecommendation[]> {
      return discoveryService.search(DEFAULT_TODAY_DISCOVERY_QUERY);
    },
  };
}
