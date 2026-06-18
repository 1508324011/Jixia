import type { FastifyReply, FastifyRequest } from "fastify";

export const defaultSessionCookieName = "jixia_session";

export type SessionCookieConfig = {
  readonly nodeEnv: "development" | "test" | "production";
  readonly sessionCookieName: string;
};

export function createSessionCookieConfig(
  options: Partial<SessionCookieConfig> = {}
): SessionCookieConfig {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;

  return {
    nodeEnv: nodeEnv === "production" || nodeEnv === "test" ? nodeEnv : "development",
    sessionCookieName:
      options.sessionCookieName ?? process.env.SESSION_COOKIE_NAME ?? defaultSessionCookieName
  };
}

export function readSessionId(request: FastifyRequest, config: SessionCookieConfig): string | undefined {
  return request.cookies[config.sessionCookieName];
}

export function setSessionCookie(
  reply: FastifyReply,
  config: SessionCookieConfig,
  sessionId: string,
  expiresAt: Date
): void {
  reply.setCookie(config.sessionCookieName, sessionId, {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.nodeEnv === "production"
  });
}

export function clearSessionCookie(reply: FastifyReply, config: SessionCookieConfig): void {
  reply.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.nodeEnv === "production"
  });
}
