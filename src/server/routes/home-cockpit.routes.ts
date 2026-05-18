import type {
  HomeCockpitActor,
  HomeCockpitResponse,
} from '@shared/contracts/home-cockpit';

import type { HomeCockpitService } from '../services/home-cockpit.service';

export interface HomeCockpitRoutes {
  getHomeCockpit(actor: HomeCockpitActor): Promise<HomeCockpitResponse>;
}

export function createHomeCockpitRoutes(
  service: HomeCockpitService,
): HomeCockpitRoutes {
  return {
    getHomeCockpit(actor: HomeCockpitActor): Promise<HomeCockpitResponse> {
      return service.getHomeCockpit(actor);
    },
  };
}
