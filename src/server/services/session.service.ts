import { createHash, randomBytes } from "node:crypto";

import type {
  LoginSessionRequest,
  LogoutSessionResponse,
  SessionResponse,
  SessionUser,
} from "@shared/contracts/session";

import type {
  PersistedSessionUserRecord,
  SessionRepository,
} from "../../db";

export const SESSION_COOKIE_NAME = "jixia_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const SESSION_LAST_SEEN_TOUCH_INTERVAL_MS = 60 * 1000;

const DEFAULT_LAB_USERS = [
  { displayName: "Alice", email: "alice@example.test", id: "user-alice" },
  { displayName: "Bob", email: "bob@example.test", id: "user-bob" },
  { displayName: "Charlie", email: "charlie@example.test", id: "user-charlie" },
] as const;

export interface SessionServiceEnv {
  NODE_ENV?: string;
}

export interface SessionLookupContext {
  userAgent?: string;
}

export interface SessionLoginResult extends SessionResponse {
  expiresAt: string;
  maxAgeSeconds: number;
  sessionToken: string;
}

export interface SessionService {
  createLoginSession(
    input: LoginSessionRequest,
    context?: SessionLookupContext,
  ): Promise<SessionLoginResult>;
  getCurrentUserFromToken(
    sessionToken: string,
    context?: SessionLookupContext,
  ): Promise<SessionUser | null>;
  revokeSessionToken(sessionToken: string): Promise<LogoutSessionResponse>;
}

export interface SessionServiceStore {
  repository: SessionRepository;
}

function mapSessionUser(user: PersistedSessionUserRecord): SessionUser {
  return {
    displayName: user.displayName,
    email: user.email,
    id: user.id,
  };
}

function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(sessionToken: string): string {
  return createHash("sha256").update(sessionToken).digest("hex");
}

function isValidSessionToken(sessionToken: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(sessionToken);
}

function computeSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
}

function shouldTouchSession(
  lastSeenAt: string | undefined,
  now: Date,
): boolean {
  if (!lastSeenAt) {
    return true;
  }

  const lastSeenAtDate = new Date(lastSeenAt);

  if (Number.isNaN(lastSeenAtDate.getTime())) {
    return true;
  }

  return now.getTime() - lastSeenAtDate.getTime() >= SESSION_LAST_SEEN_TOUCH_INTERVAL_MS;
}

function resolveLookupUserId(input: LoginSessionRequest): string | null {
  const userId = input.userId?.trim();
  if (userId) {
    return userId;
  }

  return null;
}

function resolveLookupEmail(input: LoginSessionRequest): string | null {
  const email = input.email?.trim().toLowerCase();
  if (email) {
    return email;
  }

  return null;
}

function serializeCookieParts(name: string, value: string, parts: string[]): string {
  return [`${name}=${value}`, ...parts.filter((part) => part.length > 0)].join("; ");
}

export function shouldUseSecureSessionCookies(
  env: SessionServiceEnv = process.env,
): boolean {
  return env.NODE_ENV === "production";
}

export function createSessionCookieHeader(
  sessionToken: string,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
  options: { secure?: boolean } = {},
): string {
  return serializeCookieParts(SESSION_COOKIE_NAME, sessionToken, [
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    options.secure ? "Secure" : "",
    "SameSite=Lax",
  ]);
}

export function createClearedSessionCookieHeader(
  options: { secure?: boolean } = {},
): string {
  return serializeCookieParts(SESSION_COOKIE_NAME, "", [
    "HttpOnly",
    "Max-Age=0",
    "Path=/",
    options.secure ? "Secure" : "",
    "SameSite=Lax",
  ]);
}

export function readSessionTokenFromCookieHeader(
  cookieHeader: string | null,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";");

  for (const segment of segments) {
    const separatorIndex = segment.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const cookieName = segment.slice(0, separatorIndex).trim();
    if (cookieName !== SESSION_COOKIE_NAME) {
      continue;
    }

    const cookieValue = segment.slice(separatorIndex + 1).trim();
    return cookieValue || null;
  }

  return null;
}

export function createSessionService(
  store: SessionServiceStore,
): SessionService {
  let seededUsers: Promise<void> | null = null;

  async function ensureSeededUsers(): Promise<void> {
    seededUsers ??= store.repository.seedUsers([...DEFAULT_LAB_USERS]);
    await seededUsers;
  }

  return {
    async createLoginSession(
      input: LoginSessionRequest,
      context?: SessionLookupContext,
    ): Promise<SessionLoginResult> {
      await ensureSeededUsers();

      const requestedUserId = resolveLookupUserId(input);
      const requestedEmail = resolveLookupEmail(input);

      if (!requestedUserId && !requestedEmail) {
        throw new Error("Session login requires a known user id or email.");
      }

      const user = requestedUserId
        ? await store.repository.findUserById(requestedUserId)
        : requestedEmail
          ? await store.repository.findUserByEmail(requestedEmail)
          : null;

      if (!user) {
        throw new Error("Session login failed for the requested user.");
      }

      const sessionToken = generateSessionToken();
      const expiresAt = computeSessionExpiry();

      await store.repository.createSession({
        expiresAt: expiresAt.toISOString(),
        lastSeenAt: new Date().toISOString(),
        tokenHash: hashSessionToken(sessionToken),
        userAgent: context?.userAgent,
        userId: user.id,
      });

      return {
        expiresAt: expiresAt.toISOString(),
        maxAgeSeconds: SESSION_MAX_AGE_SECONDS,
        sessionToken,
        user: mapSessionUser(user),
      };
    },
    async getCurrentUserFromToken(
      sessionToken: string,
      _context?: SessionLookupContext,
    ): Promise<SessionUser | null> {
      await ensureSeededUsers();

      if (!sessionToken || !isValidSessionToken(sessionToken)) {
        return null;
      }

      const resolved = await store.repository.findSessionByTokenHash(
        hashSessionToken(sessionToken),
      );

      if (!resolved) {
        return null;
      }

      const now = new Date();
      const revokedAt = resolved.session.revokedAt
        ? new Date(resolved.session.revokedAt)
        : null;
      const expiresAt = new Date(resolved.session.expiresAt);

      if (revokedAt || expiresAt.getTime() <= now.getTime()) {
        return null;
      }

      if (shouldTouchSession(resolved.session.lastSeenAt, now)) {
        await store.repository.touchSession(resolved.session.id, now.toISOString());
      }

      return mapSessionUser(resolved.user);
    },
    async revokeSessionToken(sessionToken: string): Promise<LogoutSessionResponse> {
      if (!sessionToken || !isValidSessionToken(sessionToken)) {
        return { ok: true };
      }

      await store.repository.revokeSessionByTokenHash(
        hashSessionToken(sessionToken),
        new Date().toISOString(),
      );

      return { ok: true };
    },
  };
}
