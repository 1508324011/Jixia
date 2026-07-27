import {
  assertionKinds,
  providerKeyMaxLength,
  providerRecordKeyMaxLength
} from "@jixia/shared";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  createSessionCookieConfig,
  readSessionId,
  setSessionCookie,
  type SessionCookieConfig
} from "../auth/cookies.js";
import { getDefaultAuthService } from "../auth/default-service.js";
import { AuthError, unauthorized } from "../auth/errors.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import { getDefaultLiteratureDiscoveryService } from "./discovery/discovery.default-service.js";
import { literatureDiscoverySearchRequestSchema } from "./discovery/discovery-query.js";
import {
  LiteratureDiscoveryError,
  type LiteratureDiscoveryService
} from "./discovery/discovery.service.js";
import { getDefaultLiteratureService } from "./literature.default-service.js";
import { getDefaultLiteratureImportService } from "./literature.default-import-service.js";
import { registerLiteratureImportRoutes } from "./literature.import-routes.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import type { LiteratureImportService } from "./literature.import-service.js";
import { registerLiteratureLibraryRoutes } from "./literature.library-routes.js";
import {
  LiteratureError,
  type LiteratureActor,
  type LiteratureService
} from "./literature.service.js";

export type LiteratureRoutesOptions = Partial<SessionCookieConfig> & {
  readonly authService?: AuthService;
  readonly discoveryService?: LiteratureDiscoveryService;
  readonly importService?: LiteratureImportService;
  readonly literatureService?: LiteratureService;
};

const literatureDiscoveryBodyLimitBytes = 132 * 1024;

const createLiteratureSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("personal") }).strict(),
  z
    .object({
      scope: z.literal("project"),
      projectId: z.string().trim().min(1).max(64)
    })
    .strict()
]);

const literatureParamsSchema = z
  .object({ literatureId: z.string().trim().min(1).max(64) })
  .strict();

const providerIdentitySchema = z
  .object({
    providerKey: z.string().trim().min(1).max(providerKeyMaxLength),
    recordKey: z.string().trim().min(1).max(providerRecordKeyMaxLength)
  })
  .strict();

const textAssertionSchema = z
  .object({
    kind: z.enum([assertionKinds[0], assertionKinds[1], assertionKinds[3]]),
    value: z.string()
  })
  .strict();

const yearAssertionSchema = z
  .object({
    kind: z.literal("publicationYear"),
    value: z.number().int()
  })
  .strict();

const appendAssertionsSchema = z
  .object({
    provider: providerIdentitySchema,
    assertions: z.array(z.union([textAssertionSchema, yearAssertionSchema])).min(1).max(4)
  })
  .strict();

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new LiteratureError("Invalid request", 400);
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

function actorFromSession(session: CurrentSessionResult): LiteratureActor {
  return {
    userId: session.session.userId,
    spaceId: session.currentSession.user.space.id,
    spaceRole: session.currentSession.user.space.role
  };
}

export const literatureRoutes: FastifyPluginAsync<LiteratureRoutesOptions> = async (app, options) => {
  const cookieConfig = createSessionCookieConfig(options);

  async function resolveAuthService(): Promise<AuthService> {
    return options.authService ?? getDefaultAuthService();
  }

  async function resolveLiteratureService(): Promise<LiteratureService> {
    return options.literatureService ?? getDefaultLiteratureService();
  }

  async function resolveDiscoveryService(): Promise<LiteratureDiscoveryService> {
    return options.discoveryService ?? getDefaultLiteratureDiscoveryService();
  }

  async function resolveImportService(): Promise<LiteratureImportService> {
    return options.importService ?? getDefaultLiteratureImportService();
  }

  async function requireActor(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<LiteratureActor> {
    const authService = await resolveAuthService();
    const session = await requireCurrentSession(request, reply, authService, cookieConfig);
    return actorFromSession(session);
  }

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LiteratureDiscoveryError) {
      return reply.status(error.statusCode).send({ error: error.code });
    }
    if (error instanceof LiteratureImportRepositoryError) {
      switch (error.code) {
        case "not_found":
          return reply.status(404).send({ error: "Not found" });
        case "forbidden":
          return reply.status(403).send({ error: "Forbidden" });
        case "idempotency_conflict":
        case "operation_conflict":
        case "stale_attempt":
        case "identity_conflict":
          return reply.status(409).send({ error: "Conflict" });
        case "invalid_batch":
        case "persistence_invariant":
          break;
        default: {
          const unreachable: never = error.code;
          throw unreachable;
        }
      }
    }
    if (error instanceof LiteratureError || error instanceof AuthError) {
      const statusCode = error.statusCode;
      if (statusCode >= 400 && statusCode < 500) {
        return reply.status(statusCode).send({ error: error.message });
      }
      if (error instanceof LiteratureError && statusCode === 503) {
        return reply.status(503).send({ error: "Service unavailable" });
      }
    }

    const statusCode =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : null;
    if (statusCode !== null && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: "Invalid request" });
    }

    request.log.error({
      errorCategory: "unexpected_error"
    }, "Literature request failed");
    return reply.status(500).send({ error: "Internal Server Error" });
  });

  registerLiteratureImportRoutes({
    app,
    requireActor,
    resolveService: resolveImportService
  });
  registerLiteratureLibraryRoutes({
    app,
    requireActor,
    resolveService: resolveLiteratureService
  });

  app.post("/literature", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const payload = parsePayload(createLiteratureSchema, request.body);
    const literatureService = await resolveLiteratureService();
    const response = await literatureService.createLiterature({ actor, request: payload });
    return reply.status(201).send(response);
  });

  app.post("/literature/discovery/search", {
    bodyLimit: literatureDiscoveryBodyLimitBytes,
    onRequest: async (request, reply) => {
      await requireActor(request, reply);
    }
  }, async (request, reply) => {
    const payload = parsePayload(literatureDiscoverySearchRequestSchema, request.body);
    const discoveryService = await resolveDiscoveryService();
    const abortController = new AbortController();
    const abortSearch = () => abortController.abort();
    request.raw.once("aborted", abortSearch);
    reply.raw.once("close", abortSearch);

    try {
      return await discoveryService.search({
        query: payload.query,
        limit: payload.limit,
        signal: abortController.signal,
        ...(payload.cursor === undefined ? {} : { cursor: payload.cursor })
      });
    } finally {
      request.raw.off("aborted", abortSearch);
      reply.raw.off("close", abortSearch);
    }
  });

  app.post("/literature/:literatureId/assertions", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const params = parsePayload(literatureParamsSchema, request.params);
    const payload = parsePayload(appendAssertionsSchema, request.body);
    const literatureService = await resolveLiteratureService();
    const response = await literatureService.appendAssertions({
      actor,
      literatureId: params.literatureId,
      request: payload
    });
    return reply.status(201).send(response);
  });

  app.get("/literature/:literatureId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const params = parsePayload(literatureParamsSchema, request.params);
    const literatureService = await resolveLiteratureService();
    return literatureService.getLiterature({
      actor,
      literatureId: params.literatureId
    });
  });
};
