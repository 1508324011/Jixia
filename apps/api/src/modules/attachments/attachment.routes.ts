import { attachmentBlockTypes } from "@jixia/shared";
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
  AttachmentError,
  getDefaultAttachmentService,
  type AttachmentActor,
  type AttachmentService
} from "./attachment.service.js";

export type AttachmentRoutesOptions = Partial<SessionCookieConfig> & {
  readonly attachmentService?: AttachmentService;
  readonly authService?: AuthService;
};

const uploadIntentParamsSchema = z.object({
  uploadIntentId: z.string().trim().min(1).max(256)
});

const attachmentParamsSchema = z.object({
  attachmentId: z.string().trim().min(1).max(256)
});

const createUploadIntentSchema = z.object({
  documentId: z.string().trim().min(1).max(256),
  blockType: z.enum(attachmentBlockTypes),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  checksum: z.string().trim().min(1).max(256).optional()
});

const confirmUploadIntentSchema = z.object({
  uploadIntentId: z.string().trim().min(1).max(256).optional()
});

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new AttachmentError("Invalid request", 400);
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

function actorFromSession(session: CurrentSessionResult): AttachmentActor {
  return {
    userId: session.session.userId,
    spaceId: session.currentSession.user.space.id,
    spaceRole: session.currentSession.user.space.role
  };
}

export const attachmentRoutes: FastifyPluginAsync<AttachmentRoutesOptions> = async (app, options) => {
  const cookieConfig = createSessionCookieConfig(options);

  async function resolveAuthService(): Promise<AuthService> {
    return options.authService ?? getDefaultAuthService();
  }

  async function resolveAttachmentService(): Promise<AttachmentService> {
    return options.attachmentService ?? getDefaultAttachmentService();
  }

  async function requireActor(request: FastifyRequest, reply: FastifyReply): Promise<AttachmentActor> {
    const authService = await resolveAuthService();
    const session = await requireCurrentSession(request, reply, authService, cookieConfig);
    return actorFromSession(session);
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AttachmentError || error instanceof AuthError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    throw error;
  });

  app.post("/attachments/upload-intents", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveAttachmentService();
    const payload = parsePayload(createUploadIntentSchema, request.body);

    return service.createUploadIntent({
      actor,
      documentId: payload.documentId,
      blockType: payload.blockType,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      ...(payload.checksum === undefined ? {} : { checksum: payload.checksum })
    });
  });

  app.post("/attachments/upload-intents/:uploadIntentId/confirm", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveAttachmentService();
    const params = parsePayload(uploadIntentParamsSchema, request.params);
    const payload = parsePayload(confirmUploadIntentSchema, request.body ?? {});

    if (payload.uploadIntentId && payload.uploadIntentId !== params.uploadIntentId) {
      throw new AttachmentError("Invalid request", 400);
    }

    return service.confirmUploadIntent({
      actor,
      uploadIntentId: params.uploadIntentId
    });
  });

  app.post("/attachments/:attachmentId/download", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveAttachmentService();
    const params = parsePayload(attachmentParamsSchema, request.params);

    return service.createAttachmentDownload({
      actor,
      attachmentId: params.attachmentId
    });
  });
};
