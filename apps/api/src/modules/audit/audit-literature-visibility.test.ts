import { describe, expect, it } from "vitest";

import {
  createAuditService,
  type AuditEventRecord,
  type AuditRepository,
  type WriteAuditEventInput
} from "./audit.service.js";

const now = new Date("2026-07-17T12:00:00.000Z");

class RecordingAuditRepository implements AuditRepository {
  readonly events: AuditEventRecord[] = [];
  excludedActionPrefixes: readonly string[] = [];

  async createAuditEvent(input: WriteAuditEventInput): Promise<AuditEventRecord> {
    const event = {
      id: `audit-${this.events.length + 1}`,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload,
      createdAt: now
    } satisfies AuditEventRecord;

    this.events.push(event);
    return event;
  }

  async listAuditEvents(input: {
    readonly action?: string;
    readonly targetType?: string;
    readonly targetId?: string;
    readonly limit: number;
    readonly cursor?: string;
    readonly excludedActionPrefixes?: readonly string[];
  }): Promise<readonly AuditEventRecord[]> {
    this.excludedActionPrefixes = input.excludedActionPrefixes ?? [];
    return this.events;
  }
}

describe("generic audit visibility", () => {
  it("excludes literature events before pagination and from the returned DTOs", async () => {
    // Given
    const repository = new RecordingAuditRepository();
    const service = createAuditService(repository);
    await service.writeAuditEvent({
      actorUserId: "user-1",
      action: "literature.created",
      targetType: "Literature",
      targetId: "literature-1",
      payload: { literatureId: "literature-1", scopeKind: "personal", ownerUserId: "user-1" }
    });
    await service.writeAuditEvent({
      actorUserId: "user-1",
      action: "document.archived",
      targetType: "Document",
      targetId: "document-1",
      payload: { documentId: "document-1" }
    });

    // When
    const response = await service.listAuditEvents({
      actor: { userId: "admin-1", spaceId: "space-1", spaceRole: "SpaceAdmin" },
      limit: 10
    });

    // Then
    expect(repository.excludedActionPrefixes).toEqual(["literature."]);
    expect(response.events.map((event) => event.action)).toEqual(["document.archived"]);
  });
});
