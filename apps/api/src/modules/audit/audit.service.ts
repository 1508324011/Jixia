import type { Prisma, PrismaClient } from "@jixia/db/generated";
import type { SpaceRole } from "@jixia/shared";

export class AuditError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AuditError";
  }
}

export type AuditActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type AuditEventRecord = {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
};

export type AuditEventDTO = {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
};

export type WriteAuditEventInput = {
  readonly actorUserId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly payload: Record<string, unknown>;
};

export type ListAuditEventsInput = {
  readonly actor: AuditActor;
  readonly action?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly limit?: number;
  readonly cursor?: string;
};

export type AuditRepository = {
  readonly createAuditEvent: (input: WriteAuditEventInput) => Promise<AuditEventRecord>;
  readonly listAuditEvents: (input: {
    readonly action?: string;
    readonly targetType?: string;
    readonly targetId?: string;
    readonly limit: number;
    readonly cursor?: string;
  }) => Promise<readonly AuditEventRecord[]>;
};

const defaultAuditPageSize = 50;
const maxAuditPageSize = 100;
const maxIdentifierLength = 256;
const maxActionLength = 256;

const forbiddenExactKeys = new Set([
  "apikey",
  "attachmentbody",
  "attachmentcontent",
  "authorization",
  "authorizationheader",
  "body",
  "content",
  "contentsnapshot",
  "cookie",
  "credentials",
  "documentbody",
  "documentcontent",
  "documentsnapshot",
  "draftcontent",
  "encryptedapikey",
  "filebody",
  "filecontent",
  "headers",
  "objectkey",
  "objectstoragecredentials",
  "password",
  "providerpayloadbody",
  "rawtoken",
  "requestbody",
  "requestheaders",
  "requiredheaders",
  "response",
  "selectedcontextbody",
  "sessionid",
  "signedurl",
  "storagecredentials",
  "storagekey",
  "token",
  "versionsnapshot"
]);

const forbiddenKeyFragments = [
  "apikey",
  "authorization",
  "body",
  "content",
  "credential",
  "cookie",
  "encryptedapikey",
  "header",
  "password",
  "prompt",
  "response",
  "signedurl",
  "token"
] as const;

const forbiddenStringFragments = [
  "awsaccesskeyid=",
  "bearer ",
  "x-amz-credential=",
  "x-amz-signature=",
  "x-goog-signature="
] as const;

function badRequest(message = "Invalid audit request"): AuditError {
  return new AuditError(message, 400);
}

function forbidden(message = "Forbidden"): AuditError {
  return new AuditError(message, 403);
}

function unavailable(message = "Audit event unavailable"): AuditError {
  return new AuditError(message, 500);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainRecordObject(value: unknown): value is Record<string, unknown> {
  if (!isRecordObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeAuditKey(key: string): string {
  return key
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isForbiddenAuditKey(key: string): boolean {
  const normalizedKey = normalizeAuditKey(key);

  return (
    forbiddenExactKeys.has(normalizedKey) ||
    forbiddenKeyFragments.some((fragment) => normalizedKey.includes(fragment))
  );
}

function isForbiddenAuditStringValue(value: string): boolean {
  const normalizedValue = value.normalize("NFKC").toLowerCase();
  return forbiddenStringFragments.some((fragment) => normalizedValue.includes(fragment));
}

function assertJsonScalar(value: unknown): void {
  if (typeof value === "string") {
    if (isForbiddenAuditStringValue(value)) {
      throw badRequest("Audit payload contains forbidden data");
    }

    return;
  }

  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return;
  }

  throw badRequest("Invalid audit payload");
}

export function ensureMetadataOnlyAuditPayload(payload: Record<string, unknown>): void {
  const visited = new WeakSet<object>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (visited.has(value)) {
        throw badRequest("Invalid audit payload");
      }

      visited.add(value);
      value.forEach(visit);
      return;
    }

    if (!isRecordObject(value)) {
      assertJsonScalar(value);
      return;
    }

    if (!isPlainRecordObject(value)) {
      throw badRequest("Invalid audit payload");
    }

    if (visited.has(value)) {
      throw badRequest("Invalid audit payload");
    }

    visited.add(value);

    for (const [key, child] of Object.entries(value)) {
      if (isForbiddenAuditKey(key)) {
        throw badRequest("Audit payload contains forbidden data");
      }

      visit(child);
    }
  };

  if (!isPlainRecordObject(payload)) {
    throw badRequest("Invalid audit payload");
  }

  visit(payload);
}

function ensureNonEmptyText(value: string, maxLength: number): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > maxLength) {
    throw badRequest();
  }

  return trimmed;
}

function ensurePageSize(limit: number | undefined): number {
  if (limit === undefined) {
    return defaultAuditPageSize;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > maxAuditPageSize) {
    throw badRequest("Invalid audit pagination");
  }

  return limit;
}

function ensureAuditInspector(actor: AuditActor): void {
  if (!actor.userId || !actor.spaceId || actor.spaceRole !== "SpaceAdmin") {
    throw forbidden();
  }
}

function toAuditEventDTO(record: AuditEventRecord): AuditEventDTO {
  ensureMetadataOnlyAuditPayload(record.payload);

  return {
    id: record.id,
    actorUserId: record.actorUserId,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    payload: record.payload,
    createdAt: toIsoString(record.createdAt)
  };
}

function metadataToPayload(value: unknown): Record<string, unknown> {
  if (!isRecordObject(value)) {
    throw unavailable();
  }

  ensureMetadataOnlyAuditPayload(value);
  return value;
}

const auditEventSelect = {
  id: true,
  actorUserId: true,
  action: true,
  targetType: true,
  targetId: true,
  metadata: true,
  createdAt: true
} satisfies Prisma.AuditEventSelect;

function toAuditEventRecord(record: {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata: unknown;
  readonly createdAt: Date;
}): AuditEventRecord {
  return {
    id: record.id,
    actorUserId: record.actorUserId,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    payload: metadataToPayload(record.metadata),
    createdAt: record.createdAt
  };
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createAuditEvent(input: WriteAuditEventInput): Promise<AuditEventRecord> {
    const event = await this.prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.payload as Prisma.InputJsonValue
      },
      select: auditEventSelect
    });

    return toAuditEventRecord(event);
  }

  async listAuditEvents(input: {
    readonly action?: string;
    readonly targetType?: string;
    readonly targetId?: string;
    readonly limit: number;
    readonly cursor?: string;
  }): Promise<readonly AuditEventRecord[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        ...(input.action === undefined ? {} : { action: input.action }),
        ...(input.targetType === undefined ? {} : { targetType: input.targetType }),
        ...(input.targetId === undefined ? {} : { targetId: input.targetId })
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
      ...(input.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
      select: auditEventSelect
    });

    return events.map(toAuditEventRecord);
  }
}

export function createAuditService(repository: AuditRepository) {
  return {
    async writeAuditEvent(input: WriteAuditEventInput): Promise<AuditEventDTO> {
      const actorUserId = ensureNonEmptyText(input.actorUserId, maxIdentifierLength);
      const action = ensureNonEmptyText(input.action, maxActionLength);
      const targetType = ensureNonEmptyText(input.targetType, maxIdentifierLength);
      const targetId = ensureNonEmptyText(input.targetId, maxIdentifierLength);

      ensureMetadataOnlyAuditPayload(input.payload);

      const event = await repository.createAuditEvent({
        actorUserId,
        action,
        targetType,
        targetId,
        payload: input.payload
      });

      return toAuditEventDTO(event);
    },

    async listAuditEvents(input: ListAuditEventsInput): Promise<{
      readonly events: readonly AuditEventDTO[];
    }> {
      ensureAuditInspector(input.actor);
      const limit = ensurePageSize(input.limit);
      const events = await repository.listAuditEvents({
        limit,
        ...(input.action === undefined ? {} : { action: ensureNonEmptyText(input.action, maxActionLength) }),
        ...(input.targetType === undefined
          ? {}
          : { targetType: ensureNonEmptyText(input.targetType, maxIdentifierLength) }),
        ...(input.targetId === undefined ? {} : { targetId: ensureNonEmptyText(input.targetId, maxIdentifierLength) }),
        ...(input.cursor === undefined ? {} : { cursor: ensureNonEmptyText(input.cursor, maxIdentifierLength) })
      });

      return { events: events.map(toAuditEventDTO) };
    }
  };
}

export type AuditService = ReturnType<typeof createAuditService>;

let cachedService: AuditService | undefined;

export async function getDefaultAuditService(): Promise<AuditService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createAuditService(new PrismaAuditRepository(prisma));
  }

  return cachedService;
}
