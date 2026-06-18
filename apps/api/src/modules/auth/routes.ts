import type {
  AcceptInvitationRequest,
  AuthMeResponse,
  AuthMutationResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  LoginRequest,
  LoginResponse
} from "@jixia/shared";
import { spaceRoles } from "@jixia/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  clearSessionCookie,
  createSessionCookieConfig,
  readSessionId,
  setSessionCookie,
  type SessionCookieConfig
} from "./cookies.js";
import { AuthError, unauthorized } from "./errors.js";
import { getDefaultAuthService } from "./default-service.js";
import type { AuthSessionRecord } from "./repository.js";
import type { AuthService, CurrentSessionResult } from "./service.js";

export type AuthRoutesOptions = Partial<SessionCookieConfig> & {
  readonly service?: AuthService;
};

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(512)
});

const createInvitationSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(spaceRoles)
});

const acceptInvitationSchema = z.object({
  invitationToken: z.string().trim().min(16).max(512),
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(512)
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new AuthError("Invalid request", 400);
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
  config: SessionCookieConfig,
  renew: boolean
): Promise<CurrentSessionResult> {
  const result = await service.getCurrentSession(requireSessionId(request, config), renew);

  if (result.renewed) {
    setSessionCookie(reply, config, result.session.id, result.session.expiresAt);
  }

  return result;
}

function sendSessionCookie(
  reply: FastifyReply,
  config: SessionCookieConfig,
  session: AuthSessionRecord
): void {
  setSessionCookie(reply, config, session.id, session.expiresAt);
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const cookieConfig = createSessionCookieConfig(options);

  async function resolveService(): Promise<AuthService> {
    return options.service ?? getDefaultAuthService();
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    throw error;
  });

  app.post("/auth/login", async (request, reply): Promise<LoginResponse> => {
    const service = await resolveService();
    const loginRequest = parseBody<LoginRequest>(loginSchema, request.body);
    const result = await service.login(loginRequest);

    sendSessionCookie(reply, cookieConfig, result.session);

    return { currentSession: result.currentSession };
  });

  app.post("/auth/logout", async (request, reply): Promise<AuthMutationResponse> => {
    const service = await resolveService();
    await service.logout(requireSessionId(request, cookieConfig));
    clearSessionCookie(reply, cookieConfig);

    return { ok: true };
  });

  app.post("/auth/logout-all", async (request, reply): Promise<AuthMutationResponse> => {
    const service = await resolveService();
    await service.logoutAll(requireSessionId(request, cookieConfig));
    clearSessionCookie(reply, cookieConfig);

    return { ok: true };
  });

  app.get("/auth/me", async (request, reply): Promise<AuthMeResponse> => {
    const service = await resolveService();
    const result = await requireCurrentSession(request, reply, service, cookieConfig, true);

    return { currentSession: result.currentSession };
  });

  app.post("/invitations", async (request, reply): Promise<CreateInvitationResponse> => {
    const service = await resolveService();
    const session = await requireCurrentSession(request, reply, service, cookieConfig, true);
    const invitationRequest = parseBody<CreateInvitationRequest>(
      createInvitationSchema,
      request.body
    );

    return service.createInvitation(session.session, invitationRequest);
  });

  app.post("/invitations/accept", async (request, reply): Promise<LoginResponse> => {
    const service = await resolveService();
    const acceptRequest = parseBody<AcceptInvitationRequest>(acceptInvitationSchema, request.body);
    const result = await service.acceptInvitation(acceptRequest);

    sendSessionCookie(reply, cookieConfig, result.session);

    return { currentSession: result.currentSession };
  });
};
