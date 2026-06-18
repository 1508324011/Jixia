import type { CurrentSessionView, SpaceRole } from "@jixia/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestApiApp } from "../../test-utils/app.js";
import { unauthorized } from "../auth/errors.js";
import type { AuthSessionRecord, AuthUserRecord } from "../auth/repository.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import {
  AuditError,
  createAuditService,
  type AuditEventRecord,
  type AuditRepository,
  type AuditService,
  type WriteAuditEventInput
} from "./audit.service.js";

const baseNow = new Date("2026-06-15T12:00:00.000Z");
const cookieName = "jixia_audit_test_session";

class InMemoryAuditRepository implements AuditRepository {
  readonly events: AuditEventRecord[] = [];

  async createAuditEvent(input: WriteAuditEventInput): Promise<AuditEventRecord> {
    const event: AuditEventRecord = {
      id: `audit-event-${this.events.length + 1}`,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload,
      createdAt: new Date(baseNow.getTime() + this.events.length * 1_000)
    };

    this.events.push(event);
    return event;
  }

  async listAuditEvents(input: {
    readonly action?: string;
    readonly targetType?: string;
    readonly targetId?: string;
    readonly limit: number;
    readonly cursor?: string;
  }): Promise<readonly AuditEventRecord[]> {
    const filtered = this.events
      .filter((event) => input.action === undefined || event.action === input.action)
      .filter((event) => input.targetType === undefined || event.targetType === input.targetType)
      .filter((event) => input.targetId === undefined || event.targetId === input.targetId)
      .sort((left, right) => {
        const createdAtOrder = right.createdAt.getTime() - left.createdAt.getTime();
        return createdAtOrder || right.id.localeCompare(left.id);
      });
    const cursorIndex = input.cursor ? filtered.findIndex((event) => event.id === input.cursor) : -1;
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;

    return filtered.slice(startIndex, startIndex + input.limit);
  }
}

function expectAuditError(error: unknown, statusCode: number): void {
  expect(error).toBeInstanceOf(AuditError);
  expect((error as AuditError).statusCode).toBe(statusCode);
}

async function expectRejectedWithStatus(promise: Promise<unknown>, statusCode: number): Promise<AuditError> {
  let caughtError: unknown;

  try {
    await promise;
  } catch (error) {
    caughtError = error;
  }

  expectAuditError(caughtError, statusCode);
  return caughtError as AuditError;
}

function expectMetadataOnly(value: unknown): void {
  expect(JSON.stringify(value)).not.toMatch(
    /secret|draft text|prompt|response|apiKey|signedUrl|authorization|cookie|token|headers|storage|body|contentSnapshot/i
  );
}

function currentSessionFor(input: {
  readonly sessionId: string;
  readonly userId: string;
  readonly spaceRole: SpaceRole;
  readonly spaceId?: string;
}): CurrentSessionResult {
  const spaceId = input.spaceId ?? "space-1";
  const user: AuthUserRecord = {
    id: input.userId,
    email: `${input.userId}@example.test`,
    displayName: input.userId,
    passwordHash: "not-used-in-audit-routes",
    spaceMembers: [
      {
        id: `${input.userId}-space-member`,
        role: input.spaceRole,
        createdAt: baseNow,
        space: { id: spaceId, name: "Jixia Lab" }
      }
    ],
    projectMembers: []
  };
  const session: AuthSessionRecord = {
    id: input.sessionId,
    userId: input.userId,
    expiresAt: new Date(baseNow.getTime() + 60_000),
    revokedAt: null,
    user
  };
  const currentSession: CurrentSessionView = {
    user: {
      id: input.userId,
      email: user.email,
      displayName: user.displayName,
      space: {
        id: spaceId,
        name: "Jixia Lab",
        role: input.spaceRole
      },
      projectMemberships: []
    },
    expiresAt: session.expiresAt.toISOString()
  };

  return { session, currentSession, renewed: false };
}

function createRouteAuthService(sessions: ReadonlyMap<string, CurrentSessionResult>): AuthService {
  return {
    async login() {
      throw new Error("not used");
    },
    async getCurrentSession(sessionId: string) {
      const session = sessions.get(sessionId);

      if (!session) {
        throw unauthorized();
      }

      return session;
    },
    async logout() {},
    async logoutAll() {},
    async createInvitation() {
      throw new Error("not used");
    },
    async acceptInvitation() {
      throw new Error("not used");
    }
  } satisfies AuthService;
}

describe("audit service", () => {
  let repository: InMemoryAuditRepository;
  let service: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    service = createAuditService(repository);
  });

  it("accepts metadata-only audit payloads and persists them", async () => {
    const response = await service.writeAuditEvent({
      actorUserId: "actor-user",
      action: "project_member.role_updated",
      targetType: "ProjectMember",
      targetId: "membership-1",
      payload: {
        projectId: "project-1",
        changedUserId: "target-user",
        previousRole: "ProjectViewer",
        nextRole: "ProjectEditor",
        reasonCode: "governance_update",
        counts: [{ affectedMembers: 1 }]
      }
    });

    expect(response).toEqual({
      id: "audit-event-1",
      actorUserId: "actor-user",
      action: "project_member.role_updated",
      targetType: "ProjectMember",
      targetId: "membership-1",
      payload: {
        projectId: "project-1",
        changedUserId: "target-user",
        previousRole: "ProjectViewer",
        nextRole: "ProjectEditor",
        reasonCode: "governance_update",
        counts: [{ affectedMembers: 1 }]
      },
      createdAt: baseNow.toISOString()
    });
    expect(repository.events).toHaveLength(1);
    expectMetadataOnly(response);
  });

  it("rejects top-level forbidden sensitive keys before persistence", async () => {
    const error = await expectRejectedWithStatus(
      service.writeAuditEvent({
        actorUserId: "actor-user",
        action: "document.archived",
        targetType: "Document",
        targetId: "document-1",
        payload: {
          contentSnapshot: { blocks: [{ text: "draft text must not be echoed" }] }
        }
      }),
      400
    );

    expect(repository.events).toHaveLength(0);
    expect(error.message).toBe("Audit payload contains forbidden data");
    expect(error.message).not.toContain("draft text must not be echoed");
  });

  it("rejects nested forbidden keys in objects and arrays with normalized matching", async () => {
    const rejectedPayloads = [
      { nested: { prompt: "secret prompt" } },
      { items: [{ ENCRYPTED_API_KEY: "encrypted-secret" }] },
      { metadata: [{ request: { headers: { authorization: "Bearer secret" } } }] },
      { upload: { signed_url: "https://storage.example/signed" } },
      { storage: { storageCredentials: { accessKeyId: "secret" } } },
      { storage: { storage_credentials: { accessKeyId: "secret" } } },
      { context: { selectedContextBody: "private AI context" } },
      { provider: { providerPayloadBody: { response: "model output" } } },
      { attachment: { fileBody: "file bytes" } },
      { attachment: { raw_content: "file bytes" } },
      { request: { httpHeaders: { accept: "application/json" } } },
      { request: { rawBody: "request body" } },
      { auth: { sessionToken: "session-secret" } }
    ];

    for (const payload of rejectedPayloads) {
      const error = await expectRejectedWithStatus(
        service.writeAuditEvent({
          actorUserId: "actor-user",
          action: "governance.checked",
          targetType: "GovernanceTarget",
          targetId: "target-1",
          payload
        }),
        400
      );

      expectMetadataOnly({ error: error.message });
    }
    expect(repository.events).toHaveLength(0);
  });

  it("requires safe identifiers and JSON-compatible payload values", async () => {
    await expectRejectedWithStatus(
      service.writeAuditEvent({
        actorUserId: " ",
        action: "project.created",
        targetType: "Project",
        targetId: "project-1",
        payload: { projectId: "project-1" }
      }),
      400
    );
    await expectRejectedWithStatus(
      service.writeAuditEvent({
        actorUserId: "actor-user",
        action: "project.created",
        targetType: "Project",
        targetId: "project-1",
        payload: { count: Number.NaN }
      }),
      400
    );
    await expectRejectedWithStatus(
      service.writeAuditEvent({
        actorUserId: "actor-user",
        action: "project.created",
        targetType: "Project",
        targetId: "project-1",
        payload: { generatedAt: new Date() }
      }),
      400
    );
    await expectRejectedWithStatus(
      service.writeAuditEvent({
        actorUserId: "actor-user",
        action: "project.created",
        targetType: "Project",
        targetId: "project-1",
        payload: { details: new Map([["projectId", "project-1"]]) }
      }),
      400
    );
    expect(repository.events).toHaveLength(0);
  });

  it("rejects obviously sensitive bearer tokens and signed URL values", async () => {
    const rejectedPayloads = [
      { location: "https://storage.example.test/object?X-Amz-Signature=secret" },
      { credentialHint: "https://storage.example.test/object?X-Amz-Credential=secret" },
      { authValue: "Bearer secret-token" }
    ];

    for (const payload of rejectedPayloads) {
      const error = await expectRejectedWithStatus(
        service.writeAuditEvent({
          actorUserId: "actor-user",
          action: "governance.checked",
          targetType: "GovernanceTarget",
          targetId: "target-1",
          payload
        }),
        400
      );

      expect(error.message).not.toContain("secret-token");
      expect(error.message).not.toContain("X-Amz-Signature");
    }
    expect(repository.events).toHaveLength(0);
  });

  it("limits audit inspection to SpaceAdmin actors and keeps listed DTOs metadata-only", async () => {
    await service.writeAuditEvent({
      actorUserId: "actor-user",
      action: "attachment.deleted",
      targetType: "DocumentAttachment",
      targetId: "attachment-1",
      payload: { attachmentId: "attachment-1", documentId: "document-1", sizeBytes: 512 }
    });
    await service.writeAuditEvent({
      actorUserId: "actor-user",
      action: "document.archived",
      targetType: "Document",
      targetId: "document-1",
      payload: { documentId: "document-1", previousStatus: "active", nextStatus: "archived" }
    });

    await expectRejectedWithStatus(
      service.listAuditEvents({
        actor: { userId: "member-user", spaceId: "space-1", spaceRole: "SpaceMember" }
      }),
      403
    );

    const response = await service.listAuditEvents({
      actor: { userId: "admin-user", spaceId: "space-1", spaceRole: "SpaceAdmin" },
      targetType: "Document",
      limit: 10
    });

    expect(response.events).toHaveLength(1);
    expect(response.events[0]).toMatchObject({ action: "document.archived", targetId: "document-1" });
    expectMetadataOnly(response);
  });
});

describe("audit routes", () => {
  let app: FastifyInstance | undefined;
  let repository: InMemoryAuditRepository;
  let service: AuditService;

  beforeEach(() => {
    repository = new InMemoryAuditRepository();
    service = createAuditService(repository);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("registers read-only audit inspection without breaking health and requires authentication", async () => {
    await service.writeAuditEvent({
      actorUserId: "actor-user",
      action: "project.created",
      targetType: "Project",
      targetId: "project-1",
      payload: { projectId: "project-1", spaceId: "space-1" }
    });
    await service.writeAuditEvent({
      actorUserId: "actor-user",
      action: "document.archived",
      targetType: "Document",
      targetId: "document-1",
      payload: { documentId: "document-1", previousStatus: "active", nextStatus: "archived" }
    });

    const sessions = new Map([
      [
        "admin-session",
        currentSessionFor({
          sessionId: "admin-session",
          userId: "admin-user",
          spaceRole: "SpaceAdmin"
        })
      ],
      [
        "member-session",
        currentSessionFor({
          sessionId: "member-session",
          userId: "member-user",
          spaceRole: "SpaceMember"
        })
      ]
    ]);
    app = await createTestApiApp({
      audit: {
        nodeEnv: "production",
        sessionCookieName: cookieName,
        authService: createRouteAuthService(sessions),
        auditService: service
      }
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });

    const unauthenticatedResponse = await app.inject({ method: "GET", url: "/audit/events" });
    expect(unauthenticatedResponse.statusCode).toBe(401);

    const forbiddenResponse = await app.inject({
      method: "GET",
      url: "/audit/events",
      headers: { cookie: `${cookieName}=member-session` }
    });
    expect(forbiddenResponse.statusCode).toBe(403);

    const listResponse = await app.inject({
      method: "GET",
      url: "/audit/events?targetType=Document&limit=5",
      headers: { cookie: `${cookieName}=admin-session` }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      events: [{ action: "document.archived", targetType: "Document", targetId: "document-1" }]
    });
    expectMetadataOnly(listResponse.json());

    const writeResponse = await app.inject({
      method: "POST",
      url: "/audit/events",
      headers: { cookie: `${cookieName}=admin-session` },
      payload: { action: "project.created" }
    });
    expect(writeResponse.statusCode).toBe(404);
  });
});
