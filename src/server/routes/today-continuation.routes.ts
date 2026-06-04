import type { TodayContinuationResponse } from '@shared/contracts/today-continuation';

import type {
  TodayContinuationActor,
  TodayContinuationService,
} from '../services/today-continuation.service';

export interface TodayContinuationRoutes {
  getTodayContinuation(
    actor: TodayContinuationActor,
  ): Promise<TodayContinuationResponse>;
}

export function createTodayContinuationRoutes(
  service: TodayContinuationService,
): TodayContinuationRoutes {
  return {
    getTodayContinuation(
      actor: TodayContinuationActor,
    ): Promise<TodayContinuationResponse> {
      return service.getTodayContinuation(actor);
    },
  };
}
