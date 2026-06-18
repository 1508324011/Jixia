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
  AuditError,
  getDefaultAuditService,
  type AuditActor,
  type AuditService
} from "./audit.service.js";

export type AuditRoutesOptions = Partial<SessionCookieConfig> & {
  readonly auditService?: AuditService;
  readonly authService?: AuthService;
};

const auditListQuerySchema = z.object({
  action: z.string().trim().min(1).max(256).optional(),
  targetType: z.string().trim().min(1).max(256).optional(),
  targetId: z.string().trim().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(256).optional()
});

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new AuditError("Invalid request", 400);
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

function actorFromSession(session: CurrentSessionResult): AuditActor {
  return {
    userId: session.session.userId,
    spaceId: session.currentSession.user.space.id,
    spaceRole: session.currentSession.user.space.role
  };
}

export const auditRoutes: FastifyPluginAsync<AuditRoutesOptions> = async (app, options) => {
  const cookieConfig = createSessionCookieConfig(options);

  async function resolveAuthService(): Promise<AuthService> {
    return options.authService ?? getDefaultAuthService();
  }

  async function resolveAuditService(): Promise<AuditService> {
    return options.auditService ?? getDefaultAuditService();
  }

  async function requireActor(request: FastifyRequest, reply: FastifyReply): Promise<AuditActor> {
    const authService = await resolveAuthService();
    const session = await requireCurrentSession(request, reply, authService, cookieConfig);
    return actorFromSession(session);
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuditError || error instanceof AuthError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    throw error;
  });

  app.get("/audit/events", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveAuditService();
    const query = parsePayload(auditListQuerySchema, request.query);

    return service.listAuditEvents({
      actor,
      ...(query.action === undefined ? {} : { action: query.action }),
      ...(query.targetType === undefined ? {} : { targetType: query.targetType }),
      ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor })
    });
  });
};
