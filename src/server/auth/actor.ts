import type { IncomingMessage } from "node:http";

export interface ActorContext {
  userId: string;
}

export interface ActorSource {
  headers: Pick<IncomingMessage["headers"], "authorization"> &
    Record<string, string | string[] | undefined>;
}

const DEV_ACTOR_HEADER = "x-jixia-actor";
const BEARER_PREFIX = "Bearer ";

function normalizeHeaderValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function parseBearerActor(authorization: string | null): string | null {
  if (!authorization?.startsWith(BEARER_PREFIX)) {
    return null;
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();

  return token.length > 0 ? token : null;
}

function resolveActorUserId(source: ActorSource): string | null {
  const devHeaderActor = normalizeHeaderValue(source.headers[DEV_ACTOR_HEADER]);
  const normalizedDevHeaderActor = devHeaderActor?.trim() || null;
  const bearerActor = parseBearerActor(
    normalizeHeaderValue(source.headers.authorization),
  );

  if (
    normalizedDevHeaderActor &&
    bearerActor &&
    normalizedDevHeaderActor !== bearerActor
  ) {
    throw new Error(
      "Conflicting actor sessions were provided by transport headers.",
    );
  }

  return normalizedDevHeaderActor ?? bearerActor;
}

export function getOptionalActor(source: ActorSource): ActorContext | undefined {
  const userId = resolveActorUserId(source);

  return userId ? { userId } : undefined;
}

export function getActor(source: ActorSource): ActorContext {
  const actor = getOptionalActor(source);

  if (!actor) {
    throw new Error(
      "Project API requires a server-derived actor session. Send x-jixia-actor for the lab-hosted MVP.",
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
