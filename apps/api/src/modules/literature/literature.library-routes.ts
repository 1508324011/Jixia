import {
  literatureLibraryDefaultLimit,
  literatureLibraryMaxLimit,
  type ListLiteratureRequest
} from "@jixia/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { LiteratureError } from "./literature.errors.js";
import type { LiteratureActor } from "./literature.repository.js";
import type { LiteratureService } from "./literature.service.js";

const listLiteratureQuerySchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("personal"),
    limit: z.coerce.number().int().min(1).max(literatureLibraryMaxLimit)
      .default(literatureLibraryDefaultLimit),
    cursor: z.string().min(1).max(8_192).optional()
  }).strict(),
  z.object({
    scope: z.literal("project"),
    projectId: z.string().trim().min(1).max(64),
    limit: z.coerce.number().int().min(1).max(literatureLibraryMaxLimit)
      .default(literatureLibraryDefaultLimit),
    cursor: z.string().min(1).max(8_192).optional()
  }).strict()
]);

function toListLiteratureRequest(
  query: z.infer<typeof listLiteratureQuerySchema>
): ListLiteratureRequest {
  const cursor = query.cursor === undefined ? {} : { cursor: query.cursor };
  return query.scope === "personal"
    ? { scope: "personal", limit: query.limit, ...cursor }
    : {
        scope: "project",
        projectId: query.projectId,
        limit: query.limit,
        ...cursor
      };
}

export function registerLiteratureLibraryRoutes(input: {
  readonly app: FastifyInstance;
  readonly requireActor: (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<LiteratureActor>;
  readonly resolveService: () => Promise<LiteratureService>;
}): void {
  input.app.get("/literature", async (request, reply) => {
    const actor = await input.requireActor(request, reply);
    const parsed = listLiteratureQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw new LiteratureError("Invalid request", 400);
    }
    const service = await input.resolveService();
    return service.listLiterature({
      actor,
      request: toListLiteratureRequest(parsed.data)
    });
  });
}
