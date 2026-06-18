import { documentHardDeleteConfirmation } from "@jixia/shared";
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
  DocumentError,
  getDefaultDocumentService,
  type DocumentActor,
  type DocumentService
} from "./document.service.js";

export type DocumentRoutesOptions = Partial<SessionCookieConfig> & {
  readonly authService?: AuthService;
  readonly documentService?: DocumentService;
};

const documentParamsSchema = z.object({
  documentId: z.string().trim().min(1).max(256)
});

const createNotebookDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200)
});

const createProjectDocumentSchema = z.object({
  projectId: z.string().trim().min(1).max(256),
  title: z.string().trim().min(1).max(200)
});

const saveDraftSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  draftContent: z.unknown()
});

const saveRevisionSchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  contentSnapshot: z.unknown(),
  title: z.string().trim().min(1).max(200).optional()
});

const hardDeleteSchema = z.object({
  confirmation: z.literal(documentHardDeleteConfirmation)
});

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);

  if (!result.success) {
    throw new DocumentError("Invalid request", 400);
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

function actorFromSession(session: CurrentSessionResult): DocumentActor {
  return {
    userId: session.session.userId,
    spaceId: session.currentSession.user.space.id,
    spaceRole: session.currentSession.user.space.role
  };
}

export const documentRoutes: FastifyPluginAsync<DocumentRoutesOptions> = async (app, options) => {
  const cookieConfig = createSessionCookieConfig(options);

  async function resolveAuthService(): Promise<AuthService> {
    return options.authService ?? getDefaultAuthService();
  }

  async function resolveDocumentService(): Promise<DocumentService> {
    return options.documentService ?? getDefaultDocumentService();
  }

  async function requireActor(request: FastifyRequest, reply: FastifyReply): Promise<DocumentActor> {
    const authService = await resolveAuthService();
    const session = await requireCurrentSession(request, reply, authService, cookieConfig);
    return actorFromSession(session);
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DocumentError || error instanceof AuthError) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    throw error;
  });

  app.post("/documents/notebook", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const payload = parsePayload(createNotebookDocumentSchema, request.body);

    return service.createNotebookDocument({ actor, title: payload.title });
  });

  app.post("/documents/project", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const payload = parsePayload(createProjectDocumentSchema, request.body);

    return service.createProjectDocument({
      actor,
      projectId: payload.projectId,
      title: payload.title
    });
  });

  app.get("/documents/:documentId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const params = parsePayload(documentParamsSchema, request.params);

    return service.readDocument(actor, params.documentId);
  });

  app.put("/documents/:documentId/draft", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const params = parsePayload(documentParamsSchema, request.params);
    const payload = parsePayload(saveDraftSchema, request.body);

    return service.saveDraft({
      actor,
      documentId: params.documentId,
      baseRevision: payload.baseRevision,
      draftContent: payload.draftContent
    });
  });

  app.post("/documents/:documentId/revisions", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const params = parsePayload(documentParamsSchema, request.params);
    const payload = parsePayload(saveRevisionSchema, request.body);
    const response = await service.saveRevision({
      actor,
      documentId: params.documentId,
      baseRevision: payload.baseRevision,
      contentSnapshot: payload.contentSnapshot,
      ...(payload.title === undefined ? {} : { title: payload.title })
    });

    if (response.outcome === "conflict") {
      reply.status(409);
    }

    return response;
  });

  app.post("/documents/:documentId/archive", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const params = parsePayload(documentParamsSchema, request.params);

    return service.archiveDocument({ actor, documentId: params.documentId });
  });

  app.post("/documents/:documentId/restore", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const params = parsePayload(documentParamsSchema, request.params);

    return service.restoreDocument({ actor, documentId: params.documentId });
  });

  app.delete("/documents/:documentId", async (request, reply) => {
    const actor = await requireActor(request, reply);
    const service = await resolveDocumentService();
    const params = parsePayload(documentParamsSchema, request.params);
    const payload = parsePayload(hardDeleteSchema, request.body);

    return service.hardDeleteDocument({
      actor,
      documentId: params.documentId,
      confirmation: payload.confirmation
    });
  });
};
