import type { ProjectWorkspaceResponse } from '@shared/contracts/projects';

import type { ProjectWorkspaceService } from '../services/project-workspace.service';

export interface ProjectWorkspaceRoutes {
  getWorkspace(projectId: string, actorUserId: string): Promise<ProjectWorkspaceResponse>;
}

export function createProjectWorkspaceRoutes(
  service: ProjectWorkspaceService,
): ProjectWorkspaceRoutes {
  return {
    getWorkspace(
      projectId: string,
      actorUserId: string,
    ): Promise<ProjectWorkspaceResponse> {
      return service.getWorkspace(projectId, actorUserId);
    },
  };
}
