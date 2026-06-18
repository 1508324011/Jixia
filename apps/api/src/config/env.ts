import { z } from "zod";

const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const apiEnvSchema = z.object({
  API_HOST: z.string().trim().min(1).default("127.0.0.1"),
  API_LOG_LEVEL: z.enum(logLevels).default("info"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SESSION_COOKIE_NAME: z.string().trim().min(1).regex(/^[A-Za-z0-9_:-]+$/).default("jixia_session")
});

export type ApiEnv = {
  readonly host: string;
  readonly logLevel: (typeof logLevels)[number];
  readonly nodeEnv: "development" | "test" | "production";
  readonly port: number;
  readonly sessionCookieName: string;
};

export class ApiEnvError extends Error {
  constructor(fields: readonly string[]) {
    super(`Invalid API environment settings: ${fields.join(", ")}`);
    this.name = "ApiEnvError";
  }
}

export function parseApiEnv(env: NodeJS.ProcessEnv): ApiEnv {
  const result = apiEnvSchema.safeParse(env);

  if (!result.success) {
    const fields = Array.from(
      new Set(result.error.issues.map((issue) => issue.path.join(".") || "environment"))
    );
    throw new ApiEnvError(fields);
  }

  return {
    host: result.data.API_HOST,
    logLevel: result.data.API_LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    port: result.data.API_PORT,
    sessionCookieName: result.data.SESSION_COOKIE_NAME
  };
}
