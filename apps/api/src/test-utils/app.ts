import type { FastifyInstance } from "fastify";

import { createApiApp, type CreateApiAppOptions } from "../app.js";

export async function createTestApiApp(options: CreateApiAppOptions = {}): Promise<FastifyInstance> {
  const app = createApiApp({ ...options, logger: false });
  await app.ready();
  return app;
}
