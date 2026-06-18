import type { FastifyPluginAsync } from "fastify";

export type HealthResponse = {
  readonly ok: true;
};

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Reply: HealthResponse }>("/health", async () => ({ ok: true }));
};
