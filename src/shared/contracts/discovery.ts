export interface TodayRecommendation {
  id: string;
  title: string;
  reason: string;
  imported: boolean;
}

export interface DiscoveryTodayResponse {
  items: TodayRecommendation[];
}

export const discoveryContract = 'jixia-discovery-contract';
