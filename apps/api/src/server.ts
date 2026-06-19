import { createApiApp } from "./app.js";
import { parseApiEnv, type ApiEnv } from "./config/env.js";
import { createObjectStorageFromEnv } from "./modules/attachments/object-storage.js";
import type { FastifyServerOptions } from "fastify";

const logger = console;

function createLoggerOptions(env: ApiEnv): FastifyServerOptions["logger"] {
  if (env.logLevel === "silent") {
    return false;
  }

  const redact: string[] = [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['set-cookie']",
    "headers.authorization",
    "headers.cookie",
    "headers['set-cookie']",
    "authorization",
    "cookie",
    "apiKey",
    "token",
    "signedUrl",
    "uploadUrl",
    "downloadUrl",
    "prompt",
    "documentBody",
    "storageKey",
    "objectKey",
    "bucket",
    "accessKeyId",
    "secretAccessKey",
    "storageCredentials",
    "credentials"
  ];

  return {
    level: env.logLevel,
    redact
  };
}

async function main(): Promise<void> {
  const env = parseApiEnv(process.env);
  const objectStorage = createObjectStorageFromEnv(process.env);
  const app = createApiApp({
    auth: {
      nodeEnv: env.nodeEnv,
      sessionCookieName: env.sessionCookieName
    },
    localObjectStorage: {
      objectStorage
    },
    logger: createLoggerOptions(env)
  });

  try {
    await app.listen({ host: env.host, port: env.port });
    logger.info("Jixia API listening on %s:%d", env.host, env.port);
  } catch (error) {
    await app.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup failure";
  logger.error("Jixia API failed to start: %s", message);
  process.exitCode = 1;
});
