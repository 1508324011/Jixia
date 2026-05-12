import type { IncomingMessage } from "node:http";

import type { SessionRoutes } from "../routes/session.routes";
import { readSessionTokenFromCookieHeader } from "../services/session.service";

export interface ActorContext {
  userId: string;
}

export interface ActorSource {
  headers: Pick<IncomingMessage["headers"], "authorization" | "cookie"> &
    Record<string, string | string[] | undefined>;
}

export interface ActorResolutionOptions {
  allowLegacyTestOverride?: boolean;
  sessionRoutes: SessionRoutes;
}

const DEV_ACTOR_HEADER = "x-jixia-actor";
const BEARER_PREFIX = "Bearer ";

function normalizeHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function parseBearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : null;
}

function readLegacyActorOverride(source: ActorSource): string | null {
  const actorHeader = normalizeHeaderValue(source.headers[DEV_ACTOR_HEADER]);
  return actorHeader?.trim() || null;
}

async function resolveSessionActorUserId(
  source: ActorSource,
  sessionRoutes: SessionRoutes,
): Promise<string | null> {
  const sessionToken = readSessionTokenFromCookieHeader(
    normalizeHeaderValue(source.headers.cookie),
  );

  if (!sessionToken) {
    return null;
  }

  const user = await sessionRoutes.getCurrentUserFromToken(sessionToken, {
    userAgent: normalizeHeaderValue(source.headers["user-agent"]) ?? undefined,
  });

  return user?.id ?? null;
}

export async function getOptionalActor(
  source: ActorSource,
  options: ActorResolutionOptions,
): Promise<ActorContext | undefined> {
  const sessionActorUserId = await resolveSessionActorUserId(
    source,
    options.sessionRoutes,
  );

  if (sessionActorUserId) {
    return { userId: sessionActorUserId };
  }

  if (!options.allowLegacyTestOverride) {
    return undefined;
  }

  const legacyActorOverride = readLegacyActorOverride(source);
  const bearerToken = parseBearerToken(
    normalizeHeaderValue(source.headers.authorization),
  );

  if (legacyActorOverride && bearerToken && legacyActorOverride !== bearerToken) {
    throw new Error(
      "Conflicting actor sessions were provided by transport headers.",
    );
  }

  const resolvedLegacyActor = legacyActorOverride ?? bearerToken;

  return resolvedLegacyActor ? { userId: resolvedLegacyActor } : undefined;
}

export async function getActor(
  source: ActorSource,
  options: ActorResolutionOptions,
): Promise<ActorContext> {
  const actor = await getOptionalActor(source, options);

  if (!actor) {
    throw new Error(
      "Project API requires a server-derived actor session from the session cookie.",
    );
  }

  return actor;
}

export function assertNoActorImpersonation(
  actor: ActorContext,
  claimedUserId: string | undefined,
): void {
  if (claimedUserId && claimedUserId !== actor.userId) {
    throw new Error("Request body actor does not match the server-derived actor.");
  }
}

export function assertNoClientActorIdentityField(
  actor: ActorContext,
  claimedUserId: unknown,
  fieldName = "actor identity",
): void {
  if (typeof claimedUserId === "undefined") {
    return;
  }

  if (typeof claimedUserId !== "string") {
    throw new Error(`${fieldName} must be a string when provided.`);
  }

  if (claimedUserId && claimedUserId !== actor.userId) {
    throw new Error("Request body actor does not match the server-derived actor.");
  }

  throw new Error(
    `Client-supplied ${fieldName} is not accepted for protected routes.`,
  );
}

export function assertNoClientActorContextField(
  claimedValue: unknown,
  fieldName = "actor context",
): void {
  if (typeof claimedValue === "undefined") {
    return;
  }

  throw new Error(
    `Client-supplied ${fieldName} is not accepted for protected routes.`,
  );
}

export function assertNoSpaceContextMismatch(
  expectedSpaceId: string,
  claimedSpaceId: string | undefined,
): void {
  if (claimedSpaceId && claimedSpaceId !== expectedSpaceId) {
    throw new Error(
      "Request space context does not match the requested resource space.",
    );
  }
}
