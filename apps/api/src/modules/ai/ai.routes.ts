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
  AIConfigError,
  type CreateAIModelProfileInput,
  type CreateAIProviderConfigInput,
  getDefaultAIConfigService,
  type AIActor,
  type AIConfigService,
  type UpdateAIModelProfileInput,
  type UpdateAIProviderConfigInput
} from "./ai-config.service.js";
import {
  AIConversationError,
  getDefaultAIConversationService,
  type AIConversationActor,
  type AIConversationService
} from "./ai-conversation.service.js";
import {
  AIUsageError,
  getDefaultAIUsageService,
  type AIUsageActor,
  type AIUsageService
} from "./ai-usage.service.js";

export type AIRoutesOptions = Partial<SessionCookieConfig> & {
  readonly aiConfigService?: AIConfigService;
  readonly aiConversationService?: AIConversationService;
  readonly aiUsageService?: AIUsageService;
  readonly authService?: AuthService;
};

const idParamsSchema = z.object({
  configId: z.string().trim().min(1).max(256).optional(),
  conversationId: z.string().trim().min(1).max(256).optional(),
  modelProfileId: z.string().trim().min(1).max(256).optional(),
  runId: z.string().trim().min(1).max(256).optional()
});

const modelProfilePayloadSchema = z.object({
  model: z.string().trim().min(1).max(256),
  displayName: z.string().trim().min(1).max(200),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const updateModelProfilePayloadSchema = modelProfilePayloadSchema.partial().refine((payload) => Object.keys(payload).length > 0);

const configPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200),
  provider: z.string().trim().min(1).max(256),
  baseURL: z.string().trim().min(1).max(2_000),
  defaultModelProfile: modelProfilePayloadSchema.optional(),
  isDefault: z.boolean().optional(),
  apiKey: z.string().trim().min(1).max(20_000).optional()
});

const updateConfigPayloadSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  provider: z.string().trim().min(1).max(256).optional(),
  baseURL: z.string().trim().min(1).max(2_000).optional(),
  isDefault: z.boolean().optional(),
  apiKey: z.string().trim().min(1).max(20_000).optional()
}).refine((payload) => Object.keys(payload).length > 0);
const testDraftConfigPayloadSchema = z.object({
  provider: z.string().trim().min(1).max(256),
  baseURL: z.string().trim().min(1).max(2_000),
  model: z.string().trim().min(1).max(256),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().positive(),
  apiKey: z.string().trim().min(1).max(20_000).optional()
});
const testSavedConfigPayloadSchema = testDraftConfigPayloadSchema.partial().extend({
  modelProfileId: z.string().trim().min(1).max(256).optional()
});

const createConversationPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  currentDocumentId: z.string().trim().min(1).max(256).nullable(),
  selectedContextSnapshot: z.unknown()
});

const appendMessagePayloadSchema = z.object({
  modelProfileId: z.string().trim().min(1).max(256),
  selectedContextSnapshot: z.unknown(),
  message: z.object({
    role: z.literal("user"),
    content: z.string().trim().min(1).max(200_000)
  })
});

const streamMessagePayloadSchema = appendMessagePayloadSchema;

const conversationListQuerySchema = z.object({
  currentDocumentId: z.string().trim().min(1).max(256).optional()
});

const usageQuerySchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime()
});

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new AIConfigError("Invalid request", 400);
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

function actorFromSession(session: CurrentSessionResult): AIActor & AIConversationActor & AIUsageActor {
  return {
    userId: session.session.userId,
    spaceId: session.currentSession.user.space.id,
    spaceRole: session.currentSession.user.space.role
  };
}

function dateRangeFromQuery(query: unknown): { readonly periodStart: Date; readonly periodEnd: Date } {
  const payload = parsePayload(usageQuerySchema, query);

  return {
    periodStart: new Date(payload.periodStart),
    periodEnd: new Date(payload.periodEnd)
  };
}

function createConfigInput(
  actor: AIActor,
  payload: z.infer<typeof configPayloadSchema>
): CreateAIProviderConfigInput {
  return {
    actor,
    name: payload.name,
    provider: payload.provider,
    baseURL: payload.baseURL,
    ...(payload.defaultModelProfile === undefined ? {} : { defaultModelProfile: modelProfileInput(payload.defaultModelProfile) }),
    ...(payload.isDefault === undefined ? {} : { isDefault: payload.isDefault }),
    ...(payload.apiKey === undefined ? {} : { apiKey: payload.apiKey })
  };
}

function modelProfileInput(payload: z.infer<typeof modelProfilePayloadSchema>) {
  return {
    model: payload.model,
    displayName: payload.displayName,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
    ...(payload.enabled === undefined ? {} : { enabled: payload.enabled }),
    ...(payload.isDefault === undefined ? {} : { isDefault: payload.isDefault })
  };
}

function updateConfigInput(
  actor: AIActor,
  configId: string,
  payload: z.infer<typeof updateConfigPayloadSchema>
): UpdateAIProviderConfigInput {
  return {
    actor,
    configId,
    ...(payload.name === undefined ? {} : { name: payload.name }),
    ...(payload.provider === undefined ? {} : { provider: payload.provider }),
    ...(payload.baseURL === undefined ? {} : { baseURL: payload.baseURL }),
    ...(payload.isDefault === undefined ? {} : { isDefault: payload.isDefault }),
    ...(payload.apiKey === undefined ? {} : { apiKey: payload.apiKey })
  };
}

function createModelProfileInput(
  actor: AIActor,
  configId: string,
  payload: z.infer<typeof modelProfilePayloadSchema>
): CreateAIModelProfileInput {
  return {
    actor,
    configId,
    model: payload.model,
    displayName: payload.displayName,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
    ...(payload.enabled === undefined ? {} : { enabled: payload.enabled }),
    ...(payload.isDefault === undefined ? {} : { isDefault: payload.isDefault })
  };
}

function updateModelProfileInput(
  actor: AIActor,
  configId: string,
  modelProfileId: string,
  payload: z.infer<typeof updateModelProfilePayloadSchema>
): UpdateAIModelProfileInput {
  return {
    actor,
    configId,
    modelProfileId,
    ...(payload.model === undefined ? {} : { model: payload.model }),
    ...(payload.displayName === undefined ? {} : { displayName: payload.displayName }),
    ...(payload.temperature === undefined ? {} : { temperature: payload.temperature }),
    ...(payload.maxTokens === undefined ? {} : { maxTokens: payload.maxTokens }),
    ...(payload.enabled === undefined ? {} : { enabled: payload.enabled }),
    ...(payload.isDefault === undefined ? {} : { isDefault: payload.isDefault })
  };
}

function ssePayload(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function writeSse(reply: FastifyReply, event: unknown): void {
  reply.raw.write(ssePayload(event));
}

function testDraftConfigInput(
  actor: AIActor,
  payload: z.infer<typeof testDraftConfigPayloadSchema>
): CreateAIProviderConfigInput extends never ? never : Parameters<AIConfigService["testDraftConfig"]>[0] {
  return {
    actor,
    provider: payload.provider,
    baseURL: payload.baseURL,
    model: payload.model,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
    ...(payload.apiKey === undefined ? {} : { apiKey: payload.apiKey })
  };
}

function testSavedConfigInput(
  actor: AIActor,
  configId: string,
  payload: z.infer<typeof testSavedConfigPayloadSchema>
): Parameters<AIConfigService["testSavedConfig"]>[0] {
  return {
    actor,
    configId,
    ...(payload.modelProfileId === undefined ? {} : { modelProfileId: payload.modelProfileId }),
    ...(payload.provider === undefined ? {} : { provider: payload.provider }),
    ...(payload.baseURL === undefined ? {} : { baseURL: payload.baseURL }),
    ...(payload.model === undefined ? {} : { model: payload.model }),
    ...(payload.temperature === undefined ? {} : { temperature: payload.temperature }),
    ...(payload.maxTokens === undefined ? {} : { maxTokens: payload.maxTokens }),
    ...(payload.apiKey === undefined ? {} : { apiKey: payload.apiKey })
  };
}

export const aiRoutes: FastifyPluginAsync<AIRoutesOptions> = async (app, options) => {
  const cookieConfig = createSessionCookieConfig(options);

  async function resolveAuthService(): Promise<AuthService> {
    return options.authService ?? getDefaultAuthService();
  }

  async function resolveAIConfigService(): Promise<AIConfigService> {
    return options.aiConfigService ?? getDefaultAIConfigService();
  }

  async function resolveAIConversationService(): Promise<AIConversationService> {
    return options.aiConversationService ?? getDefaultAIConversationService();
  }

  async function resolveAIUsageService(): Promise<AIUsageService> {
    return options.aiUsageService ?? getDefaultAIUsageService();
  }

  async function requireActor(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<AIActor & AIConversationActor & AIUsageActor> {
    const authService = await resolveAuthService();
    const session = await requireCurrentSession(request, reply, authService, cookieConfig);
    return actorFromSession(session);
  }

  app.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof AIConfigError ||
      error instanceof AIConversationError ||
      error instanceof AIUsageError ||
      error instanceof AuthError
    ) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    throw error;
  });

  app.get("/ai/configs", async (request, reply) => {
    const actor = await requireActor(request, reply);
    return (await resolveAIConfigService()).listConfigs(actor);
  });

  app.post("/ai/configs", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const payload = parsePayload(configPayloadSchema, request.body);
    return (await resolveAIConfigService()).createConfig(createConfigInput(actor, payload));
  });

  app.post("/ai/configs/test", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const payload = parsePayload(testDraftConfigPayloadSchema, request.body);
    return (await resolveAIConfigService()).testDraftConfig(testDraftConfigInput(actor, payload));
  });

  app.get("/ai/configs/:configId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId } = parsePayload(idParamsSchema.required({ configId: true }), request.params);
    return (await resolveAIConfigService()).getConfig(actor, configId);
  });

  app.patch("/ai/configs/:configId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId } = parsePayload(idParamsSchema.required({ configId: true }), request.params);
    const payload = parsePayload(updateConfigPayloadSchema, request.body);
    return (await resolveAIConfigService()).updateConfig(updateConfigInput(actor, configId, payload));
  });

  app.post("/ai/configs/:configId/test", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId } = parsePayload(idParamsSchema.required({ configId: true }), request.params);
    const payload = parsePayload(testSavedConfigPayloadSchema, request.body ?? {});
    return (await resolveAIConfigService()).testSavedConfig(testSavedConfigInput(actor, configId, payload));
  });

  app.post("/ai/configs/:configId/discover-models", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId } = parsePayload(idParamsSchema.required({ configId: true }), request.params);
    return (await resolveAIConfigService()).discoverModels({ actor, configId });
  });

  app.post("/ai/configs/:configId/model-profiles", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId } = parsePayload(idParamsSchema.required({ configId: true }), request.params);
    const payload = parsePayload(modelProfilePayloadSchema, request.body);
    return (await resolveAIConfigService()).createModelProfile(createModelProfileInput(actor, configId, payload));
  });

  app.patch("/ai/configs/:configId/model-profiles/:modelProfileId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId, modelProfileId } = parsePayload(
      idParamsSchema.required({ configId: true, modelProfileId: true }),
      request.params
    );
    const payload = parsePayload(updateModelProfilePayloadSchema, request.body);
    return (await resolveAIConfigService()).updateModelProfile(
      updateModelProfileInput(actor, configId, modelProfileId, payload)
    );
  });

  app.delete("/ai/configs/:configId/model-profiles/:modelProfileId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId, modelProfileId } = parsePayload(
      idParamsSchema.required({ configId: true, modelProfileId: true }),
      request.params
    );
    return (await resolveAIConfigService()).deleteModelProfile({ actor, configId, modelProfileId });
  });

  app.post("/ai/configs/:configId/model-profiles/:modelProfileId/default", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId, modelProfileId } = parsePayload(
      idParamsSchema.required({ configId: true, modelProfileId: true }),
      request.params
    );
    return (await resolveAIConfigService()).setDefaultModelProfile({ actor, configId, modelProfileId });
  });

  app.delete("/ai/configs/:configId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId } = parsePayload(idParamsSchema.required({ configId: true }), request.params);
    return (await resolveAIConfigService()).deleteConfig({ actor, configId });
  });

  app.post("/ai/configs/:configId/default", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { configId } = parsePayload(idParamsSchema.required({ configId: true }), request.params);
    return (await resolveAIConfigService()).setDefaultConfig({ actor, configId });
  });

  app.get("/ai/conversations", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const query = parsePayload(conversationListQuerySchema, request.query);
    const service = await resolveAIConversationService();

    if (query.currentDocumentId) {
      return service.listConversationsForDocument(actor, query.currentDocumentId);
    }

    return service.listConversations(actor);
  });

  app.post("/ai/conversations", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const payload = parsePayload(createConversationPayloadSchema, request.body);
    return (await resolveAIConversationService()).createConversation({ actor, ...payload });
  });

  app.get("/ai/conversations/:conversationId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { conversationId } = parsePayload(
      idParamsSchema.required({ conversationId: true }),
      request.params
    );
    return (await resolveAIConversationService()).getConversation(actor, conversationId);
  });

  app.post("/ai/conversations/:conversationId/messages", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { conversationId } = parsePayload(
      idParamsSchema.required({ conversationId: true }),
      request.params
    );
    const payload = parsePayload(appendMessagePayloadSchema, request.body);
    return (await resolveAIConversationService()).appendMessage({ actor, conversationId, ...payload });
  });

  app.post("/ai/conversations/:conversationId/messages/stream", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { conversationId } = parsePayload(
      idParamsSchema.required({ conversationId: true }),
      request.params
    );
    const payload = parsePayload(streamMessagePayloadSchema, request.body);
    const service = await resolveAIConversationService();
    const stream = service.streamMessage({ actor, conversationId, ...payload })[Symbol.asyncIterator]();
    const firstEvent = await stream.next();

    reply.hijack();
    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8"
    });

    try {
      if (!firstEvent.done) {
        writeSse(reply, firstEvent.value);
      }

      for (let nextEvent = await stream.next(); !nextEvent.done; nextEvent = await stream.next()) {
        writeSse(reply, nextEvent.value);
      }
    } catch (error) {
      if (error instanceof AIConversationError) {
        writeSse(reply, { type: "error", category: "unknown", message: error.message });
      } else {
        writeSse(reply, { type: "error", category: "unknown", message: "AI stream failed." });
      }
    } finally {
      reply.raw.end();
    }

    return reply;
  });

  app.post("/ai/runs/:runId/cancel", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { runId } = parsePayload(idParamsSchema.required({ runId: true }), request.params);
    return (await resolveAIConversationService()).cancelRun({ actor, runId });
  });

  app.delete("/ai/conversations/:conversationId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const { conversationId } = parsePayload(
      idParamsSchema.required({ conversationId: true }),
      request.params
    );
    return (await resolveAIConversationService()).deleteConversation({ actor, conversationId });
  });

  app.get("/ai/usage/me", async (request, reply) => {
    const actor = await requireActor(request, reply);
    return (await resolveAIUsageService()).getMyUsage({ actor, ...dateRangeFromQuery(request.query) });
  });

  app.get("/ai/usage/space", async (request, reply) => {
    const actor = await requireActor(request, reply);
    return (await resolveAIUsageService()).getSpaceUsage({ actor, ...dateRangeFromQuery(request.query) });
  });
};
