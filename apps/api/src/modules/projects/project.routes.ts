import type { AuthMutationResponse, ProjectRole } from "@jixia/shared";
import { projectRoles } from "@jixia/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  createSessionCookieConfig,
  readSessionId,
  setSessionCookie,
  type SessionCookieConfig
} from "../auth/cookies.js";
import { AuthError, unauthorized } from "../auth/errors.js";
import { getDefaultAuthService } from "../auth/default-service.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import {
  getDefaultProjectService,
  ProjectError,
  type ProjectActor,
  type ProjectService
} from "./project.service.js";

export type ProjectRoutesOptions = Partial<SessionCookieConfig> & {
  readonly authService?: AuthService;
  readonly projectService?: ProjectService;
};

const addableProjectRoles = ["ProjectEditor", "ProjectViewer"] as const;

const projectParamsSchema = z.object({
  projectId: z.string().trim().min(1).max(256)
});

const projectMemberParamsSchema = projectParamsSchema.extend({
  userId: z.string().trim().min(1).max(256)
});

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  spaceId: z.string().trim().min(1).max(256).optional()
});

const addProjectMemberSchema = z.object({
  userId: z.string().trim().min(1).max(256),
  role: z.enum(addableProjectRoles)
});

const updateProjectMemberSchema = z.object({
  role: z.enum(projectRoles)
});

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new ProjectError("Invalid request", 400);
  }

  return result.data;
}

function requireSessionId(request: FastifyRequest, config: SessionCookieConfig): string {
  const sessionId = readSessionId(request, config);

  if (!sessionId) {
    throw unauthorized();
  }

  return sessionId;
}

async function requireCurrentSession(
  request: FastifyRequest,
  reply: FastifyReply,
  service: AuthService,
  config: SessionCookieConfig
): Promise<CurrentSessionResult> {
  const result = await service.getCurrentSession(requireSessionId(request, config), true);

  if (result.renewed) {
    setSessionCookie(reply, config, result.session.id, result.session.expiresAt);
  }

  return result;
}

function actorFromSession(session: CurrentSessionResult): ProjectActor {
  return {
    userId: session.session.userId,
    spaceId: session.currentSession.user.space.id,
    spaceRole: session.currentSession.user.space.role
  };
}

export const projectRoutes: FastifyPluginAsync<ProjectRoutesOptions> = async (app, options) => {
  const cookieConfig = createSessionCookieConfig(options);

  async function resolveAuthService(): Promise<AuthService> {
    return options.authService ?? getDefaultAuthService();
  }

  async function resolveProjectService(): Promise<ProjectService> {
    return options.projectService ?? getDefaultProjectService();
  }

  async function requireActor(request: FastifyRequest, reply: FastifyReply): Promise<ProjectActor> {
    const authService = await resolveAuthService();
    const session = await requireCurrentSession(request, reply, authService, cookieConfig);
    return actorFromSession(session);
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ProjectError || error instanceof AuthError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    throw error;
  });

  app.get("/projects", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveProjectService();
    return service.listProjects(actor);
  });

  app.post("/projects", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveProjectService();
    const payload = parsePayload(createProjectSchema, request.body);

    if (payload.spaceId && payload.spaceId !== actor.spaceId) {
      throw new ProjectError("Not found", 404);
    }

    return service.createProject({ actor, name: payload.name });
  });

  app.get("/projects/:projectId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveProjectService();
    const params = parsePayload(projectParamsSchema, request.params);

    return service.getProject(actor, params.projectId);
  });

  app.get("/projects/:projectId/members", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveProjectService();
    const params = parsePayload(projectParamsSchema, request.params);

    return service.listMembers(actor, params.projectId);
  });

  app.post("/projects/:projectId/members", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveProjectService();
    const params = parsePayload(projectParamsSchema, request.params);
    const payload = parsePayload(addProjectMemberSchema, request.body);

    return service.addMember({
      actor,
      projectId: params.projectId,
      userId: payload.userId,
      role: payload.role as ProjectRole
    });
  });

  app.patch("/projects/:projectId/members/:userId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveProjectService();
    const params = parsePayload(projectMemberParamsSchema, request.params);
    const payload = parsePayload(updateProjectMemberSchema, request.body);

    return service.updateMember({
      actor,
      projectId: params.projectId,
      userId: params.userId,
      role: payload.role as ProjectRole
    });
  });

  app.delete(
    "/projects/:projectId/members/:userId",
    async (request, reply): Promise<AuthMutationResponse> => {
      const actor = await requireActor(request, reply);
      const service = await resolveProjectService();
      const params = parsePayload(projectMemberParamsSchema, request.params);

      return service.removeMember({
        actor,
        projectId: params.projectId,
        userId: params.userId
      });
    }
  );
};
