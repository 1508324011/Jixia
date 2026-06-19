import type {
  AttachmentBlockType,
  CurrentSessionView,
  ProjectRole,
  SpaceRole,
  UploadFailureReason,
  UploadIntentStatus
} from "@jixia/shared";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthSessionRecord, AuthUserRecord } from "../auth/repository.js";
import { unauthorized } from "../auth/errors.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import type { PermissionService } from "../permissions/permission.service.js";
import { createTestApiApp } from "../../test-utils/app.js";
import {
  AttachmentError,
  createAttachmentService,
  PrismaAttachmentRepository,
  type AttachmentActor,
  type AttachmentRecord,
  type AttachmentRepository,
  type AttachmentService,
  type ConfirmUploadIntentRepositoryResult,
  type UploadIntentRecord
} from "./attachment.service.js";
import {
  createObjectStorageFromEnv,
  LocalObjectStorage,
  ObjectStorageError,
  type ObjectMetadata,
  type ObjectStorage
} from "./object-storage.js";

const baseNow = new Date("2026-06-14T12:00:00.000Z");
const oneHourLater = new Date("2026-06-14T13:00:00.000Z");
const cookieName = "jixia_attachment_test_session";

type DocumentRecord = {
  readonly id: string;
  readonly type: "notebook" | "project";
  readonly status: "active" | "archived";
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
};

class InMemoryAttachmentRepository implements AttachmentRepository {
  readonly users = new Set<string>();
  readonly documents = new Map<string, DocumentRecord>();
  readonly projectMembers = new Map<string, ProjectRole>();
  readonly uploadIntents = new Map<string, UploadIntentRecord>();
  readonly attachments = new Map<string, AttachmentRecord>();
  readonly auditEvents: unknown[] = [];
  confirmRace = false;

  async createUploadIntent(input: {
    readonly documentId: string;
    readonly uploaderUserId: string;
    readonly blockType: AttachmentBlockType;
    readonly storageKey: string;
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly checksum: string | null;
    readonly createdAt: Date;
    readonly expiresAt: Date;
  }): Promise<UploadIntentRecord> {
    const intent: UploadIntentRecord = {
      id: `intent-${this.uploadIntents.size + 1}`,
      documentId: input.documentId,
      uploaderUserId: input.uploaderUserId,
      blockType: input.blockType,
      storageKey: input.storageKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
      status: "pending",
      failureReason: null,
      failureDetail: null,
      expiresAt: input.expiresAt,
      confirmedAt: null,
      cleanedAt: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    };
    this.uploadIntents.set(intent.id, intent);
    return intent;
  }

  async findUploadIntentById(uploadIntentId: string): Promise<UploadIntentRecord | null> {
    return this.uploadIntents.get(uploadIntentId) ?? null;
  }

  async confirmUploadIntent(input: {
    readonly uploadIntentId: string;
    readonly uploaderUserId: string;
    readonly now: Date;
    readonly etag: string | null;
  }): Promise<ConfirmUploadIntentRepositoryResult> {
    const intent = this.uploadIntents.get(input.uploadIntentId);

    if (
      this.confirmRace ||
      !intent ||
      intent.uploaderUserId !== input.uploaderUserId ||
      intent.status !== "pending" ||
      intent.expiresAt <= input.now
    ) {
      return { outcome: "unavailable" };
    }

    const confirmedIntent: UploadIntentRecord = {
      ...intent,
      status: "confirmed",
      failureReason: null,
      failureDetail: null,
      confirmedAt: input.now,
      updatedAt: input.now
    };
    const attachment: AttachmentRecord = {
      id: `attachment-${this.attachments.size + 1}`,
      documentId: intent.documentId,
      uploadIntentId: intent.id,
      uploadedByUserId: intent.uploaderUserId,
      storageKey: intent.storageKey,
      fileName: intent.fileName,
      mimeType: intent.mimeType,
      sizeBytes: intent.sizeBytes,
      checksum: intent.checksum,
      etag: input.etag,
      createdAt: input.now
    };
    this.uploadIntents.set(intent.id, confirmedIntent);
    this.attachments.set(attachment.id, attachment);

    return { outcome: "confirmed", intent: confirmedIntent, attachment };
  }

  async markUploadIntentFailed(input: {
    readonly uploadIntentId: string;
    readonly uploaderUserId: string;
    readonly failureReason: UploadFailureReason;
    readonly failureDetail: string;
  }): Promise<UploadIntentRecord | null> {
    const intent = this.uploadIntents.get(input.uploadIntentId);

    if (!intent || intent.uploaderUserId !== input.uploaderUserId || intent.status !== "pending") {
      return null;
    }

    const failedIntent: UploadIntentRecord = {
      ...intent,
      status: "failed",
      failureReason: input.failureReason,
      failureDetail: input.failureDetail,
      updatedAt: baseNow
    };
    this.uploadIntents.set(intent.id, failedIntent);
    return failedIntent;
  }

  async findAttachmentById(attachmentId: string): Promise<AttachmentRecord | null> {
    return this.attachments.get(attachmentId) ?? null;
  }

  seedUser(userId: string): void {
    this.users.add(userId);
  }

  seedNotebook(documentId: string, ownerUserId: string, status: "active" | "archived" = "active"): void {
    this.documents.set(documentId, {
      id: documentId,
      type: "notebook",
      status,
      ownerUserId,
      projectId: null
    });
  }

  seedProjectDocument(documentId: string, status: "active" | "archived" = "active"): void {
    this.documents.set(documentId, {
      id: documentId,
      type: "project",
      status,
      ownerUserId: null,
      projectId: "project-1"
    });
  }

  seedProjectMember(userId: string, role: ProjectRole): void {
    this.projectMembers.set(userId, role);
  }
}

class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, ObjectMetadata>();
  readonly putUrls: string[] = [];
  readonly getUrls: string[] = [];
  failHead = false;

  async createPresignedPutUrl(input: {
    readonly storageKey: string;
    readonly mimeType: string;
    readonly expiresInSeconds: number;
    readonly now?: Date;
  }) {
    const issuedAt = input.now ?? baseNow;
    const url = `https://storage.example.test/upload/${encodeURIComponent(input.storageKey)}/target`;
    this.putUrls.push(url);
    return {
      url,
      requiredHeaders: { "content-type": input.mimeType },
      expiresAt: new Date(issuedAt.getTime() + input.expiresInSeconds * 1_000)
    };
  }

  async createPresignedGetUrl(input: {
    readonly storageKey: string;
    readonly expiresInSeconds: number;
    readonly now?: Date;
  }) {
    const issuedAt = input.now ?? baseNow;
    const url = `https://storage.example.test/download/${encodeURIComponent(input.storageKey)}/target`;
    this.getUrls.push(url);
    return {
      url,
      expiresAt: new Date(issuedAt.getTime() + input.expiresInSeconds * 1_000)
    };
  }

  async headObject(storageKey: string): Promise<ObjectMetadata | null> {
    if (this.failHead) {
      throw new ObjectStorageError();
    }

    return this.objects.get(storageKey) ?? null;
  }

  async deleteObject(): Promise<void> {}
}

function createPermissionFacade(
  repository: InMemoryAttachmentRepository
): Pick<PermissionService, "canEditDocument" | "canDownloadAttachment"> {
  async function canReadDocument(userId: string, documentId: string): Promise<boolean> {
    if (!repository.users.has(userId)) {
      return false;
    }
    const document = repository.documents.get(documentId);
    if (!document) {
      return false;
    }
    if (document.type === "notebook") {
      return document.ownerUserId === userId && document.projectId === null;
    }
    if (document.ownerUserId !== null || !document.projectId) {
      return false;
    }
    return repository.projectMembers.has(userId);
  }

  return {
    async canEditDocument(userId: string, documentId: string): Promise<boolean> {
      const document = repository.documents.get(documentId);
      if (!(await canReadDocument(userId, documentId)) || !document || document.status !== "active") {
        return false;
      }
      if (document.type === "notebook") {
        return true;
      }
      return ["ProjectOwner", "ProjectEditor"].includes(repository.projectMembers.get(userId) ?? "");
    },
    async canDownloadAttachment(userId: string, attachmentId: string): Promise<boolean> {
      const attachment = repository.attachments.get(attachmentId);
      return attachment ? canReadDocument(userId, attachment.documentId) : false;
    }
  };
}

function actor(userId: string, spaceRole: SpaceRole = "SpaceMember"): AttachmentActor {
  return { userId, spaceId: "space-1", spaceRole };
}

function expectAttachmentError(error: unknown, statusCode: number): void {
  expect(error).toBeInstanceOf(AttachmentError);
  expect((error as AttachmentError).statusCode).toBe(statusCode);
}

async function expectRejectedWithStatus(promise: Promise<unknown>, statusCode: number): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    expectAttachmentError(error, statusCode);
    return true;
  });
}

function currentSessionFor(input: {
  readonly sessionId: string;
  readonly userId: string;
  readonly spaceRole: SpaceRole;
}): CurrentSessionResult {
  const user: AuthUserRecord = {
    id: input.userId,
    email: `${input.userId}@example.test`,
    displayName: input.userId,
    passwordHash: "not-used-in-attachment-routes",
    spaceMembers: [
      {
        id: `${input.userId}-space-member`,
        role: input.spaceRole,
        createdAt: baseNow,
        space: { id: "space-1", name: "Jixia Lab" }
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
        id: "space-1",
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

describe("attachment service", () => {
  let repository: InMemoryAttachmentRepository;
  let storage: InMemoryObjectStorage;
  let service: AttachmentService;
  let currentTime: Date;

  beforeEach(() => {
    repository = new InMemoryAttachmentRepository();
    storage = new InMemoryObjectStorage();
    currentTime = baseNow;
    for (const userId of ["notebook-owner", "project-owner", "project-editor", "project-viewer", "non-member"]) {
      repository.seedUser(userId);
    }
    repository.seedNotebook("notebook-1", "notebook-owner");
    repository.seedProjectDocument("project-document-1");
    repository.seedProjectMember("project-owner", "ProjectOwner");
    repository.seedProjectMember("project-editor", "ProjectEditor");
    repository.seedProjectMember("project-viewer", "ProjectViewer");
    service = createAttachmentService(repository, createPermissionFacade(repository), storage, {
      now: () => currentTime,
      createStorageKey: (fileName) => `tmp/uploads/fixed/${fileName.replace(/\s+/g, "-")}`
    });
  });

  it("creates upload intents only for editors with safe metadata and transient signed URLs", async () => {
    const response = await service.createUploadIntent({
      actor: actor("notebook-owner"),
      documentId: "notebook-1",
      blockType: "image",
      fileName: " figure 1.png ",
      mimeType: " IMAGE/PNG ",
      sizeBytes: 1024,
      checksum: "sha256-safe"
    });

    expect(response.intent).toMatchObject({
      id: "intent-1",
      documentId: "notebook-1",
      uploaderUserId: "notebook-owner",
      blockType: "image",
      fileName: "figure 1.png",
      mimeType: "image/png",
      sizeBytes: 1024,
      checksum: "sha256-safe",
      status: "pending",
      expiresAt: oneHourLater.toISOString()
    });
    expect(response.upload).toMatchObject({
      method: "PUT",
      requiredHeaders: { "content-type": "image/png" },
      expiresAt: oneHourLater.toISOString()
    });
    expect(response.upload.url).toContain("/upload/");
    const storedIntent = repository.uploadIntents.get("intent-1");
    expect(storedIntent?.storageKey).toBe("tmp/uploads/fixed/figure-1.png");
    expect(JSON.stringify(storedIntent)).not.toMatch(/signed|authorization|cookie|token|credential|contents/i);
    await expectRejectedWithStatus(
      service.createUploadIntent({
        actor: actor("project-viewer"),
        documentId: "project-document-1",
        blockType: "file",
        fileName: "viewer.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128
      }),
      403
    );
  });

  it("enforces locked image and file upload limits", async () => {
    await expectRejectedWithStatus(
      service.createUploadIntent({
        actor: actor("notebook-owner"),
        documentId: "notebook-1",
        blockType: "image",
        fileName: "huge.png",
        mimeType: "image/png",
        sizeBytes: 100 * 1024 * 1024 + 1
      }),
      400
    );
    await expectRejectedWithStatus(
      service.createUploadIntent({
        actor: actor("notebook-owner"),
        documentId: "notebook-1",
        blockType: "file",
        fileName: "huge.bin",
        mimeType: "application/octet-stream",
        sizeBytes: 200 * 1024 * 1024 + 1
      }),
      400
    );
  });

  it("confirms uploads after ownership permission HEAD size and MIME checks", async () => {
    const created = await service.createUploadIntent({
      actor: actor("project-editor"),
      documentId: "project-document-1",
      blockType: "file",
      fileName: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096
    });
    const storageKey = repository.uploadIntents.get(created.intent.id)!.storageKey;
    storage.objects.set(storageKey, {
      sizeBytes: 4096,
      mimeType: "application/pdf",
      etag: "etag-1"
    });

    const response = await service.confirmUploadIntent({
      actor: actor("project-editor"),
      uploadIntentId: created.intent.id
    });

    expect(response.intent.status).toBe("confirmed");
    expect(response.attachment).toMatchObject({
      id: "attachment-1",
      documentId: "project-document-1",
      uploadedByUserId: "project-editor",
      fileName: "paper.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      etag: "etag-1"
    });
    expect(repository.attachments).toHaveLength(1);
  });

  it("records locked failure reasons for missing size MIME storage expired and permission failures", async () => {
    async function createIntent(storageMetadata?: ObjectMetadata): Promise<string> {
      const created = await service.createUploadIntent({
        actor: actor("notebook-owner"),
        documentId: "notebook-1",
        blockType: "image",
        fileName: `figure-${repository.uploadIntents.size}.png`,
        mimeType: "image/png",
        sizeBytes: 100
      });
      if (storageMetadata) {
        storage.objects.set(repository.uploadIntents.get(created.intent.id)!.storageKey, storageMetadata);
      }
      return created.intent.id;
    }

    const missingId = await createIntent();
    await expectRejectedWithStatus(service.confirmUploadIntent({ actor: actor("notebook-owner"), uploadIntentId: missingId }), 409);
    expect(repository.uploadIntents.get(missingId)).toMatchObject({ status: "failed", failureReason: "object_missing" });

    const sizeId = await createIntent({ sizeBytes: 101, mimeType: "image/png", etag: null });
    await expectRejectedWithStatus(service.confirmUploadIntent({ actor: actor("notebook-owner"), uploadIntentId: sizeId }), 409);
    expect(repository.uploadIntents.get(sizeId)).toMatchObject({ status: "failed", failureReason: "size_mismatch" });

    const mimeId = await createIntent({ sizeBytes: 100, mimeType: "application/pdf", etag: null });
    await expectRejectedWithStatus(service.confirmUploadIntent({ actor: actor("notebook-owner"), uploadIntentId: mimeId }), 409);
    expect(repository.uploadIntents.get(mimeId)).toMatchObject({ status: "failed", failureReason: "mime_mismatch" });

    const storageId = await createIntent();
    storage.failHead = true;
    await expectRejectedWithStatus(service.confirmUploadIntent({ actor: actor("notebook-owner"), uploadIntentId: storageId }), 503);
    expect(repository.uploadIntents.get(storageId)).toMatchObject({ status: "failed", failureReason: "storage_error" });
    storage.failHead = false;

    const expiredId = await createIntent({ sizeBytes: 100, mimeType: "image/png", etag: null });
    currentTime = new Date(oneHourLater.getTime() + 1);
    await expectRejectedWithStatus(service.confirmUploadIntent({ actor: actor("notebook-owner"), uploadIntentId: expiredId }), 409);
    expect(repository.uploadIntents.get(expiredId)).toMatchObject({ status: "failed", failureReason: "expired" });

    currentTime = baseNow;
    const permissionId = await createIntent({ sizeBytes: 100, mimeType: "image/png", etag: null });
    repository.documents.set("notebook-1", { ...repository.documents.get("notebook-1")!, status: "archived" });
    await expectRejectedWithStatus(
      service.confirmUploadIntent({ actor: actor("notebook-owner"), uploadIntentId: permissionId }),
      403
    );
    expect(repository.uploadIntents.get(permissionId)).toMatchObject({ status: "failed", failureReason: "permission_revoked" });
  });

  it("rejects non-owner and cleanup-raced confirmations safely", async () => {
    const created = await service.createUploadIntent({
      actor: actor("notebook-owner"),
      documentId: "notebook-1",
      blockType: "image",
      fileName: "race.png",
      mimeType: "image/png",
      sizeBytes: 100
    });
    const storageKey = repository.uploadIntents.get(created.intent.id)!.storageKey;
    storage.objects.set(storageKey, { sizeBytes: 100, mimeType: "image/png", etag: "etag-race" });

    await expectRejectedWithStatus(service.confirmUploadIntent({ actor: actor("project-owner"), uploadIntentId: created.intent.id }), 404);
    repository.confirmRace = true;
    await expectRejectedWithStatus(service.confirmUploadIntent({ actor: actor("notebook-owner"), uploadIntentId: created.intent.id }), 409);
    expect(repository.attachments).toHaveLength(0);
  });

  it("issues private download URLs only after inherited attachment permission and without audit", async () => {
    const created = await service.createUploadIntent({
      actor: actor("project-editor"),
      documentId: "project-document-1",
      blockType: "file",
      fileName: "dataset.csv",
      mimeType: "text/csv",
      sizeBytes: 64
    });
    const storageKey = repository.uploadIntents.get(created.intent.id)!.storageKey;
    storage.objects.set(storageKey, { sizeBytes: 64, mimeType: "text/csv", etag: "etag-download" });
    const confirmed = await service.confirmUploadIntent({
      actor: actor("project-editor"),
      uploadIntentId: created.intent.id
    });

    const response = await service.createAttachmentDownload({
      actor: actor("project-viewer"),
      attachmentId: confirmed.attachment.id
    });

    expect(response.downloadUrl).toContain("/download/");
    expect(response.expiresAt).toBe(new Date(baseNow.getTime() + 15 * 60 * 1_000).toISOString());
    expect(repository.auditEvents).toHaveLength(0);
    await expectRejectedWithStatus(
      service.createAttachmentDownload({ actor: actor("non-member"), attachmentId: confirmed.attachment.id }),
      404
    );
  });
});

describe("PrismaAttachmentRepository", () => {
  it("atomically rejects confirmations that cleanup already claimed", async () => {
    const prisma = {
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          uploadIntent: {
            updateMany: async () => ({ count: 0 })
          }
        })
    } as unknown as ConstructorParameters<typeof PrismaAttachmentRepository>[0];
    const repository = new PrismaAttachmentRepository(prisma);

    await expect(
      repository.confirmUploadIntent({
        uploadIntentId: "intent-raced",
        uploaderUserId: "uploader",
        now: baseNow,
        etag: null
      })
    ).resolves.toEqual({ outcome: "unavailable" });
  });
});

describe("attachment routes", () => {
  let app: FastifyInstance | undefined;
  let repository: InMemoryAttachmentRepository;
  let storage: InMemoryObjectStorage;
  let service: AttachmentService;

  beforeEach(() => {
    repository = new InMemoryAttachmentRepository();
    storage = new InMemoryObjectStorage();
    repository.seedUser("route-user");
    repository.seedNotebook("route-document", "route-user");
    service = createAttachmentService(repository, createPermissionFacade(repository), storage, {
      now: () => baseNow,
      createStorageKey: (fileName) => `tmp/uploads/route/${fileName}`
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("registers attachment routes without breaking health and requires authentication", async () => {
    const sessions = new Map([
      [
        "route-session",
        currentSessionFor({
          sessionId: "route-session",
          userId: "route-user",
          spaceRole: "SpaceMember"
        })
      ]
    ]);
    app = await createTestApiApp({
      attachments: {
        nodeEnv: "production",
        sessionCookieName: cookieName,
        authService: createRouteAuthService(sessions),
        attachmentService: service
      }
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });

    const unauthenticatedResponse = await app.inject({
      method: "POST",
      url: "/attachments/upload-intents",
      payload: {
        documentId: "route-document",
        blockType: "image",
        fileName: "route.png",
        mimeType: "image/png",
        sizeBytes: 10
      }
    });
    expect(unauthenticatedResponse.statusCode).toBe(401);

    const createResponse = await app.inject({
      method: "POST",
      url: "/attachments/upload-intents",
      headers: { cookie: `${cookieName}=route-session` },
      payload: {
        documentId: "route-document",
        blockType: "image",
        fileName: "route.png",
        mimeType: "image/png",
        sizeBytes: 10
      }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      intent: { id: "intent-1", status: "pending" },
      upload: { method: "PUT" }
    });

    storage.objects.set("tmp/uploads/route/route.png", {
      sizeBytes: 10,
      mimeType: "image/png",
      etag: "route-etag"
    });
    const confirmResponse = await app.inject({
      method: "POST",
      url: "/attachments/upload-intents/intent-1/confirm",
      headers: { cookie: `${cookieName}=route-session` },
      payload: {}
    });
    expect(confirmResponse.statusCode).toBe(200);
    expect(confirmResponse.json()).toMatchObject({
      intent: { status: "confirmed" },
      attachment: { id: "attachment-1", etag: "route-etag" }
    });

    const downloadResponse = await app.inject({
      method: "POST",
      url: "/attachments/attachment-1/download",
      headers: { cookie: `${cookieName}=route-session` },
      payload: {}
    });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.json()).toMatchObject({
      attachment: { id: "attachment-1" }
    });
    expect(downloadResponse.json().downloadUrl).toContain("/download/");
    expect(repository.auditEvents).toHaveLength(0);
  });
});

describe("local object storage", () => {
  let rootDirectory: string;
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), "jixia-local-storage-test-"));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await rm(rootDirectory, { recursive: true, force: true });
  });

  function createLocalStorage(): LocalObjectStorage {
    return new LocalObjectStorage({
      rootDirectory,
      publicBaseUrl: "http://127.0.0.1:3000/local-object-storage",
      signingSecret: "test-local-storage-signing-secret",
      allowedOrigins: ["http://127.0.0.1:5173"]
    });
  }

  it("defaults to local storage outside production when S3 configuration is absent", async () => {
    expect(createObjectStorageFromEnv({ NODE_ENV: "development" })).toBeInstanceOf(LocalObjectStorage);
    expect(() => createObjectStorageFromEnv({ NODE_ENV: "development", S3_ENDPOINT: "http://127.0.0.1:9000" })).toThrow(
      /configuration is incomplete/i
    );
    expect(() =>
      createObjectStorageFromEnv({ NODE_ENV: "production", ATTACHMENT_STORAGE_DRIVER: "local" })
    ).toThrow(/not available in production/i);
    expect(() =>
      createObjectStorageFromEnv({ NODE_ENV: "development", ATTACHMENT_STORAGE_DRIVER: "bogus" })
    ).toThrow(/driver is invalid/i);
    expect(() => createObjectStorageFromEnv({ NODE_ENV: "production" })).toThrow(/configuration is incomplete/i);

    const localStorage = createObjectStorageFromEnv({
      NODE_ENV: "development",
      API_HOST: "0.0.0.0",
      API_PORT: "3333",
      ATTACHMENT_STORAGE_DRIVER: "local"
    });
    const upload = await localStorage.createPresignedPutUrl({
      storageKey: "tmp/uploads/local/browser-host.txt",
      mimeType: "text/plain",
      expiresInSeconds: 60
    });
    expect(upload.url).toMatch(/^http:\/\/127\.0\.0\.1:3333\/local-object-storage\/upload\//);
  });

  it("serves signed local upload and download requests with browser-safe CORS", async () => {
    const storage = createLocalStorage();
    app = await createTestApiApp({ localObjectStorage: { objectStorage: storage } });
    const upload = await storage.createPresignedPutUrl({
      storageKey: "tmp/uploads/local/figure.svg",
      mimeType: "image/svg+xml",
      expiresInSeconds: 60
    });
    const uploadPath = new URL(upload.url).pathname + new URL(upload.url).search;

    const preflightResponse = await app.inject({
      method: "OPTIONS",
      url: uploadPath,
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type"
      }
    });
    expect(preflightResponse.statusCode).toBe(204);
    expect(preflightResponse.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(preflightResponse.headers["access-control-expose-headers"]).toBe("ETag");

    const uploadResponse = await app.inject({
      method: "PUT",
      url: uploadPath,
      headers: {
        origin: "http://127.0.0.1:5173",
        "content-type": "image/svg+xml"
      },
      payload: Buffer.from("<svg />", "utf8")
    });
    expect(uploadResponse.statusCode).toBe(200);
    expect(uploadResponse.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(uploadResponse.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
    await expect(storage.headObject("tmp/uploads/local/figure.svg")).resolves.toMatchObject({
      sizeBytes: 7,
      mimeType: "image/svg+xml"
    });

    const download = await storage.createPresignedGetUrl({
      storageKey: "tmp/uploads/local/figure.svg",
      expiresInSeconds: 60
    });
    const downloadPath = new URL(download.url).pathname + new URL(download.url).search;
    const downloadResponse = await app.inject({
      method: "GET",
      url: downloadPath,
      headers: { origin: "http://127.0.0.1:5173" }
    });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.headers["content-type"]).toContain("image/svg+xml");
    expect(downloadResponse.body).toBe("<svg />");
  });

  it("rejects credentialed direct uploads and disallowed CORS requests", async () => {
    const storage = createLocalStorage();
    app = await createTestApiApp({ localObjectStorage: { objectStorage: storage } });
    const upload = await storage.createPresignedPutUrl({
      storageKey: "tmp/uploads/local/secret.png",
      mimeType: "image/png",
      expiresInSeconds: 60
    });
    const uploadPath = new URL(upload.url).pathname + new URL(upload.url).search;

    const disallowedPreflight = await app.inject({
      method: "OPTIONS",
      url: uploadPath,
      headers: {
        origin: "http://evil.example.test",
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type"
      }
    });
    expect(disallowedPreflight.statusCode).toBe(403);

    const credentialedUpload = await app.inject({
      method: "PUT",
      url: uploadPath,
      headers: {
        origin: "http://127.0.0.1:5173",
        cookie: "jixia_session=should-not-send",
        "content-type": "image/png"
      },
      payload: Buffer.from("secret")
    });
    expect(credentialedUpload.statusCode).toBe(400);
    await expect(storage.headObject("tmp/uploads/local/secret.png")).resolves.toBeNull();

    const authorizationUpload = await app.inject({
      method: "PUT",
      url: uploadPath,
      headers: {
        origin: "http://127.0.0.1:5173",
        authorization: "Bearer should-not-send",
        "content-type": "image/png"
      },
      payload: Buffer.from("secret")
    });
    expect(authorizationUpload.statusCode).toBe(400);
    await expect(storage.headObject("tmp/uploads/local/secret.png")).resolves.toBeNull();

    const credentialHeaderUpload = await app.inject({
      method: "PUT",
      url: uploadPath,
      headers: {
        origin: "http://127.0.0.1:5173",
        "content-type": "image/png",
        "x-amz-signature": "should-not-send"
      },
      payload: Buffer.from("secret")
    });
    expect(credentialHeaderUpload.statusCode).toBe(400);
    await expect(storage.headObject("tmp/uploads/local/secret.png")).resolves.toBeNull();
  });

  it("expires local signed object requests", async () => {
    const storage = createLocalStorage();
    const upload = await storage.createPresignedPutUrl({
      storageKey: "tmp/uploads/local/expired.txt",
      mimeType: "text/plain",
      expiresInSeconds: 1,
      now: baseNow
    });
    const url = new URL(upload.url);
    const storageKeyTokenParts = url.pathname.split("/");
    const storageKeyToken = storageKeyTokenParts[storageKeyTokenParts.length - 1] ?? "";

    expect(
      storage.verifySignedRequest({
        method: "PUT",
        storageKeyToken,
        expires: url.searchParams.get("expires") ?? undefined,
        signature: url.searchParams.get("signature") ?? undefined,
        now: new Date(baseNow.getTime() + 2_000)
      })
    ).toBeNull();
  });
});
