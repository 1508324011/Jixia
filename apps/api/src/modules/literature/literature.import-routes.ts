import {
  providerRecordKeyMaxLength
} from "@jixia/shared";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { z } from "zod";

import { LiteratureError } from "./literature.service.js";
import type { LiteratureImportService } from "./literature.import-service.js";
import { isCanonicalLiteratureDoi } from "./literature.normalization.js";
import type { LiteratureActor } from "./literature.repository.js";
import {
  isCanonicalOpenAlexRecordKey,
  isCanonicalPubmedRecordKey
} from "./discovery/provider-identities.js";

const importTargetSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("personal") }).strict(),
  z.object({
    scope: z.literal("project"),
    projectId: z.string().trim().min(1).max(64)
  }).strict()
]);

const providerRecordKeySchema = z.string().min(1).max(providerRecordKeyMaxLength);

const importSeedSchema = z.discriminatedUnion("providerKey", [
  z.object({
    providerKey: z.literal("openalex"),
    recordKey: providerRecordKeySchema.refine(isCanonicalOpenAlexRecordKey)
  }).strict(),
  z.object({
    providerKey: z.literal("crossref"),
    recordKey: providerRecordKeySchema.refine(isCanonicalLiteratureDoi)
  }).strict(),
  z.object({
    providerKey: z.literal("pubmed"),
    recordKey: providerRecordKeySchema.refine(isCanonicalPubmedRecordKey)
  }).strict()
]);

const createImportSchema = z.object({
  target: importTargetSchema,
  seed: importSeedSchema
}).strict();

const importOperationParamsSchema = z.object({
  operationId: z.string().trim().min(1).max(64)
}).strict();

const idempotencyKeySchema = z.uuid();
const retryImportBodySchema = z.undefined();

export type RegisterLiteratureImportRoutesInput = {
  readonly app: FastifyInstance;
  readonly requireActor: (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<LiteratureActor>;
  readonly resolveService: () => Promise<LiteratureImportService>;
};

export function registerLiteratureImportRoutes(
  input: RegisterLiteratureImportRoutesInput
): void {
  const actors = new WeakMap<FastifyRequest, LiteratureActor>();

  async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    actors.set(request, await input.requireActor(request, reply));
  }

  function actorFor(request: FastifyRequest): LiteratureActor {
    const actor = actors.get(request);
    if (actor === undefined) {
      throw new LiteratureError("Authenticated actor missing from request lifecycle", 500);
    }
    return actor;
  }

  input.app.post(
    "/literature/imports",
    { onRequest: authenticate },
    async (request, reply) => {
      const actor = actorFor(request);
      const payload = parseImportPayload(createImportSchema, request.body);
      const idempotencyKey = parseImportPayload(
        idempotencyKeySchema,
        request.headers["idempotency-key"]
      );
      const service = await input.resolveService();
      const result = await service.createImport({
        actor,
        request: payload,
        idempotencyKey
      });
      return reply.status(result.kind === "created" ? 201 : 200).send(result.response);
    }
  );

  input.app.get(
    "/literature/imports/:operationId",
    { onRequest: authenticate },
    async (request) => {
      const actor = actorFor(request);
      const params = parseImportPayload(importOperationParamsSchema, request.params);
      const service = await input.resolveService();
      return service.getImportOperation({ actor, operationId: params.operationId });
    }
  );

  input.app.post(
    "/literature/imports/:operationId/retry",
    { onRequest: authenticate },
    async (request) => {
      const actor = actorFor(request);
      const params = parseImportPayload(importOperationParamsSchema, request.params);
      parseImportPayload(retryImportBodySchema, request.body);
      const service = await input.resolveService();
      return service.retryImport({ actor, operationId: params.operationId });
    }
  );
}

function parseImportPayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new LiteratureError("Invalid request", 400);
  }
  return result.data;
}
