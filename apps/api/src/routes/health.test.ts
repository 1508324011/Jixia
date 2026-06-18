import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createTestApiApp } from "../test-utils/app.js";

describe("GET /health", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns a shallow application health response", async () => {
    app = await createTestApiApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ ok: true });
  });
});
