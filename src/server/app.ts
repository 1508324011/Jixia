import type { SpaceMembership } from '@shared/contracts/spaces';

import {
  createHealthRoutes,
  type HealthRoutes,
} from './routes/health.routes';
import {
  createSpacesRoutes,
  type SpacesRoutes,
} from './routes/spaces.routes';
import {
  createSpacesService,
  type StoredSpace,
} from './services/spaces.service';

export interface JixiaAppState {
  memberships: SpaceMembership[];
  nextSequence: number;
  spaces: StoredSpace[];
}

export interface JixiaApp {
  health: HealthRoutes;
  spaces: SpacesRoutes;
}

function createState(): JixiaAppState {
  return {
    memberships: [],
    nextSequence: 0,
    spaces: [],
  };
}

function nextId(state: JixiaAppState, prefix: string): string {
  state.nextSequence += 1;

  return `${prefix}-${state.nextSequence}`;
}

export function createJixiaApp(): JixiaApp {
  const state = createState();
  const spacesService = createSpacesService({
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    spaces: state.spaces,
  });

  return {
    health: createHealthRoutes(),
    spaces: createSpacesRoutes(spacesService),
  };
}
