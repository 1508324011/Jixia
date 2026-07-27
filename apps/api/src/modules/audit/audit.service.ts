import type { Prisma, PrismaClient } from "@jixia/db/generated";
import type { SpaceRole } from "@jixia/shared";

import { AuditError } from "./audit.errors.js";
import {
  ensureMetadataOnlyAuditPayload,
  parseMetadataOnlyAuditPayload
} from "./audit.metadata.js";

export { AuditError } from "./audit.errors.js";
export { ensureMetadataOnlyAuditPayload } from "./audit.metadata.js";

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
    readonly excludedActionPrefixes: readonly string[];
  }) => Promise<readonly AuditEventRecord[]>;
};

const defaultAuditPageSize = 50;
const maxAuditPageSize = 100;
const maxIdentifierLength = 256;
const maxActionLength = 256;
const genericAuditExcludedActionPrefixes = ["literature."] as const;

function badRequest(message = "Invalid audit request"): AuditError {
  return new AuditError(message, 400);
}

function forbidden(message = "Forbidden"): AuditError {
  return new AuditError(message, 403);
}

function toIsoString(date: Date): string {
  return date.toISOString();
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
    payload: parseMetadataOnlyAuditPayload(record.metadata),
    createdAt: record.createdAt
  };
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createAuditEvent(input: WriteAuditEventInput): Promise<AuditEventRecord> {
    const metadata = input.payload;
    ensureMetadataOnlyAuditPayload(metadata);
    const event = await this.prisma.auditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata
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
    readonly excludedActionPrefixes: readonly string[];
  }): Promise<readonly AuditEventRecord[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        NOT: input.excludedActionPrefixes.map((prefix) => ({ action: { startsWith: prefix } })),
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
        excludedActionPrefixes: genericAuditExcludedActionPrefixes,
        ...(input.action === undefined ? {} : { action: ensureNonEmptyText(input.action, maxActionLength) }),
        ...(input.targetType === undefined
          ? {}
          : { targetType: ensureNonEmptyText(input.targetType, maxIdentifierLength) }),
        ...(input.targetId === undefined ? {} : { targetId: ensureNonEmptyText(input.targetId, maxIdentifierLength) }),
        ...(input.cursor === undefined ? {} : { cursor: ensureNonEmptyText(input.cursor, maxIdentifierLength) })
      });

      return {
        events: events
          .filter(
            (event) =>
              !genericAuditExcludedActionPrefixes.some((prefix) => event.action.startsWith(prefix))
          )
          .map(toAuditEventDTO)
      };
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
