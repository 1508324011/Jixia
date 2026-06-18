import type { CurrentSessionView, EditorSnapshot, ProjectRole, SpaceRole } from "@jixia/shared";
import { documentHardDeleteConfirmation } from "@jixia/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AuthSessionRecord, AuthUserRecord } from "../auth/repository.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import { unauthorized } from "../auth/errors.js";
import type { PermissionService } from "../permissions/permission.service.js";
import { createTestApiApp } from "../../test-utils/app.js";
import { createEmptyEditorSnapshot, EditorSchemaError, normalizeEditorSnapshot } from "./editor-schema.js";
import {
  createDocumentService,
  DocumentError,
  PrismaDocumentRepository,
  type AuditEventRecord,
  type CreateDocumentRepositoryInput,
  type DocumentActor,
  type DocumentDraftRecord,
  type DocumentProjectMembershipRecord,
  type DocumentProjectRecord,
  type DocumentRecord,
  type DocumentRepository,
  type DocumentRevisionRecord,
  type DocumentService,
  type HardDeleteDocumentRepositoryResult,
  type SaveDocumentRevisionRepositoryResult
} from "./document.service.js";

const baseNow = new Date("2026-06-14T12:00:00.000Z");
const cookieName = "jixia_document_test_session";

type UserRecord = {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

type AttachmentRecord = {
  readonly id: string;
  readonly documentId: string;
};

const paragraphSnapshot = {
  editorSchemaVersion: 1,
  blocks: [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "Initial finding"
    }
  ]
} as const satisfies EditorSnapshot;

const updatedSnapshot = {
  editorSchemaVersion: 1,
  blocks: [
    {
      id: "heading-1",
      type: "heading",
      text: "Updated finding"
    },
    {
      id: "todo-1",
      type: "todo",
      attrs: { checked: false },
      content: []
    }
  ]
} as const satisfies EditorSnapshot;

class InMemoryDocumentRepository implements DocumentRepository {
  readonly users = new Map<string, UserRecord>();
  readonly projects = new Map<string, DocumentProjectRecord>();
  readonly projectMembers = new Map<string, DocumentProjectMembershipRecord>();
  readonly documents = new Map<string, DocumentRecord>();
  readonly drafts = new Map<string, DocumentDraftRecord>();
  readonly revisions = new Map<string, DocumentRevisionRecord>();
  readonly attachments = new Map<string, AttachmentRecord>();
  readonly auditEvents: AuditEventRecord[] = [];

  async findProjectById(projectId: string): Promise<DocumentProjectRecord | null> {
    return this.projects.get(projectId) ?? null;
  }

  async findProjectMembership(input: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<DocumentProjectMembershipRecord | null> {
    return this.projectMembers.get(this.projectMemberKey(input.projectId, input.userId)) ?? null;
  }

  async createDocument(input: CreateDocumentRepositoryInput): Promise<DocumentRecord> {
    const project = input.projectId ? this.projects.get(input.projectId) : null;
    const document: DocumentRecord = {
      id: `document-${this.documents.size + 1}`,
      type: input.type,
      status: "active",
      title: input.title,
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      projectSpaceId: project?.spaceId ?? null,
      currentRevisionId: null,
      currentRevision: null,
      revisionNumber: 0,
      createdAt: this.nextDate(this.documents.size),
      updatedAt: this.nextDate(this.documents.size)
    };
    this.documents.set(document.id, document);
    this.auditEvents.push({
      action: "document.created",
      targetType: "Document",
      targetId: document.id,
      metadata: {
        documentId: document.id,
        documentType: input.type,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        revisionNumber: 0
      }
    });

    return document;
  }

  async findDocumentById(documentId: string): Promise<DocumentRecord | null> {
    return this.documents.get(documentId) ?? null;
  }

  async saveDraft(input: {
    readonly documentId: string;
    readonly userId: string;
    readonly baseRevision: number;
    readonly draftContent: EditorSnapshot;
  }): Promise<DocumentDraftRecord> {
    const draft: DocumentDraftRecord = {
      documentId: input.documentId,
      userId: input.userId,
      baseRevision: input.baseRevision,
      draftContent: input.draftContent,
      updatedAt: this.nextDate(this.drafts.size + 10)
    };
    this.drafts.set(this.draftKey(input.documentId, input.userId), draft);
    return draft;
  }

  async saveRevision(input: {
    readonly actorUserId: string;
    readonly documentId: string;
    readonly baseRevision: number;
    readonly contentSnapshot: EditorSnapshot;
    readonly title?: string;
  }): Promise<SaveDocumentRevisionRepositoryResult> {
    const document = this.documents.get(input.documentId);

    if (!document) {
      return { outcome: "missing" };
    }
    if (!this.isValidDocumentContext(document)) {
      return { outcome: "invalid-current-revision" };
    }
    if (document.status !== "active") {
      return { outcome: "archived" };
    }
    if (document.revisionNumber !== input.baseRevision) {
      return { outcome: "conflict", document };
    }

    const revision: DocumentRevisionRecord = {
      id: `revision-${this.revisions.size + 1}`,
      documentId: document.id,
      revisionNumber: document.revisionNumber + 1,
      contentSnapshot: input.contentSnapshot,
      editorUserId: input.actorUserId,
      createdAt: this.nextDate(this.revisions.size + 100)
    };
    const updatedDocument: DocumentRecord = {
      ...document,
      title: input.title ?? document.title,
      currentRevisionId: revision.id,
      currentRevision: revision,
      revisionNumber: revision.revisionNumber,
      updatedAt: this.nextDate(this.revisions.size + 200)
    };

    this.revisions.set(revision.id, revision);
    this.documents.set(document.id, updatedDocument);
    this.drafts.delete(this.draftKey(document.id, input.actorUserId));
    this.auditEvents.push({
      action: "document_revision.saved",
      targetType: "DocumentRevision",
      targetId: revision.id,
      metadata: {
        documentId: document.id,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        editorUserId: input.actorUserId
      }
    });

    return { outcome: "saved", document: updatedDocument, revision };
  }

  async archiveDocument(input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }): Promise<DocumentRecord | null> {
    return this.updateStatus(input, "archived", "document.archived");
  }

  async restoreDocument(input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }): Promise<DocumentRecord | null> {
    return this.updateStatus(input, "active", "document.restored");
  }

  async hardDeleteDocument(input: {
    readonly actorUserId: string;
    readonly documentId: string;
  }): Promise<HardDeleteDocumentRepositoryResult | null> {
    const document = this.documents.get(input.documentId);

    if (!document) {
      return null;
    }

    const deletedDrafts = this.deleteMatching(this.drafts, (draft) => draft.documentId === input.documentId);
    const deletedRevisions = this.deleteMatching(
      this.revisions,
      (revision) => revision.documentId === input.documentId
    );
    const deletedAttachments = this.deleteMatching(
      this.attachments,
      (attachment) => attachment.documentId === input.documentId
    );
    this.documents.delete(input.documentId);
    this.auditEvents.push({
      action: "document.hard_deleted",
      targetType: "Document",
      targetId: input.documentId,
      metadata: {
        documentId: input.documentId,
        documentType: document.type,
        ownerUserId: document.ownerUserId,
        projectId: document.projectId,
        revisionNumber: document.revisionNumber,
        deletedDraftCount: deletedDrafts,
        deletedRevisionCount: deletedRevisions,
        deletedAttachmentCount: deletedAttachments
      }
    });

    return { documentId: input.documentId, deletedAt: this.nextDate(999) };
  }

  seedUser(input: {
    readonly id: string;
    readonly spaceId?: string;
    readonly spaceRole?: SpaceRole;
  }): void {
    this.users.set(input.id, {
      id: input.id,
      spaceId: input.spaceId ?? "space-1",
      spaceRole: input.spaceRole ?? "SpaceMember"
    });
  }

  seedProject(input: {
    readonly id: string;
    readonly spaceId?: string;
    readonly members?: readonly { readonly userId: string; readonly role: ProjectRole }[];
  }): void {
    const project: DocumentProjectRecord = { id: input.id, spaceId: input.spaceId ?? "space-1" };
    this.projects.set(project.id, project);

    for (const member of input.members ?? []) {
      this.projectMembers.set(this.projectMemberKey(project.id, member.userId), { role: member.role });
    }
  }

  seedAttachment(documentId: string): void {
    const attachment: AttachmentRecord = {
      id: `attachment-${this.attachments.size + 1}`,
      documentId
    };
    this.attachments.set(attachment.id, attachment);
  }

  private updateStatus(
    input: { readonly actorUserId: string; readonly documentId: string },
    status: "active" | "archived",
    action: string
  ): DocumentRecord | null {
    const document = this.documents.get(input.documentId);

    if (!document) {
      return null;
    }

    const updatedDocument: DocumentRecord = {
      ...document,
      status,
      updatedAt: this.nextDate(400 + this.auditEvents.length)
    };
    this.documents.set(input.documentId, updatedDocument);
    this.auditEvents.push({
      action,
      targetType: "Document",
      targetId: input.documentId,
      metadata: {
        documentId: input.documentId,
        documentType: document.type,
        previousStatus: document.status,
        nextStatus: status,
        ownerUserId: document.ownerUserId,
        projectId: document.projectId,
        revisionNumber: document.revisionNumber
      }
    });

    return updatedDocument;
  }

  private deleteMatching<T>(items: Map<string, T>, predicate: (value: T) => boolean): number {
    let count = 0;

    for (const [key, value] of Array.from(items.entries())) {
      if (predicate(value)) {
        items.delete(key);
        count += 1;
      }
    }

    return count;
  }

  private isValidDocumentContext(document: DocumentRecord): boolean {
    if (document.type === "notebook") {
      return document.ownerUserId !== null && document.projectId === null;
    }

    return document.ownerUserId === null && document.projectId !== null;
  }

  private draftKey(documentId: string, userId: string): string {
    return `${documentId}:${userId}`;
  }

  private projectMemberKey(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }

  private nextDate(offsetSeconds: number): Date {
    return new Date(baseNow.getTime() + offsetSeconds * 1_000);
  }
}

class BrokenStoredSnapshotRepository extends InMemoryDocumentRepository {
  async findDocumentById(documentId: string): Promise<DocumentRecord | null> {
    const document = await super.findDocumentById(documentId);

    if (document?.currentRevision) {
      throw new EditorSchemaError("Unsupported editor block type");
    }

    return document;
  }
}

function createPermissionFacade(
  repository: InMemoryDocumentRepository
): Pick<
  PermissionService,
  "canReadDocument" | "canEditDocument" | "canArchiveDocument" | "canHardDeleteDocument"
> {
  async function documentPermission(
    userId: string,
    documentId: string,
    action: "read" | "edit" | "archive" | "hard-delete"
  ): Promise<boolean> {
    if (!repository.users.has(userId)) {
      return false;
    }

    const document = await repository.findDocumentById(documentId);

    if (!document) {
      return false;
    }
    if (document.type === "notebook") {
      if (document.ownerUserId !== userId || document.projectId !== null) {
        return false;
      }

      return action !== "edit" || document.status === "active";
    }
    if (document.ownerUserId !== null || !document.projectId) {
      return false;
    }

    const membership = await repository.findProjectMembership({ projectId: document.projectId, userId });

    if (!membership) {
      return false;
    }
    if (action === "read") {
      return true;
    }
    if (action === "edit") {
      return document.status === "active" && ["ProjectOwner", "ProjectEditor"].includes(membership.role);
    }

    return membership.role === "ProjectOwner";
  }

  return {
    canReadDocument: (userId, documentId) => documentPermission(userId, documentId, "read"),
    canEditDocument: (userId, documentId) => documentPermission(userId, documentId, "edit"),
    canArchiveDocument: (userId, documentId) => documentPermission(userId, documentId, "archive"),
    canHardDeleteDocument: (userId, documentId) => documentPermission(userId, documentId, "hard-delete")
  };
}

function actor(userId: string, spaceRole: SpaceRole = "SpaceMember", spaceId = "space-1"): DocumentActor {
  return { userId, spaceId, spaceRole };
}

function expectDocumentError(error: unknown, statusCode: number): void {
  expect(error).toBeInstanceOf(DocumentError);
  expect((error as DocumentError).statusCode).toBe(statusCode);
}

async function expectRejectedWithStatus(promise: Promise<unknown>, statusCode: number): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    expectDocumentError(error, statusCode);
    return true;
  });
}

function expectMetadataOnly(event: AuditEventRecord): void {
  const serialized = JSON.stringify(event.metadata);

  expect(serialized).not.toMatch(
    /content|contentSnapshot|draftContent|prompt|response|apiKey|signedUrl|authorization|cookie|session|token|password|storage|headers/i
  );
}

function expectAuditEvent(event: AuditEventRecord | undefined): AuditEventRecord {
  expect(event).toBeDefined();
  return event as AuditEventRecord;
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
    passwordHash: "not-used-in-document-routes",
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

describe("editor schema helpers", () => {
  it("normalizes legacy versionless snapshots to the current supported schema", () => {
    expect(normalizeEditorSnapshot({ blocks: paragraphSnapshot.blocks })).toEqual(paragraphSnapshot);
    expect(normalizeEditorSnapshot({ editorSchemaVersion: 1, blocks: [] })).toEqual(
      createEmptyEditorSnapshot()
    );
  });

  it("rejects unknown schema versions and unsupported block types", () => {
    expect(() => normalizeEditorSnapshot({ editorSchemaVersion: 2, blocks: [] })).toThrow();
    expect(() =>
      normalizeEditorSnapshot({
        editorSchemaVersion: 1,
        blocks: [{ id: "x", type: "mermaid" }]
      })
    ).toThrow();
  });
});

describe("document service", () => {
  let repository: InMemoryDocumentRepository;
  let service: DocumentService;

  beforeEach(() => {
    repository = new InMemoryDocumentRepository();
    for (const userId of [
      "notebook-owner",
      "project-owner",
      "project-editor",
      "project-viewer",
      "space-admin",
      "non-member"
    ]) {
      repository.seedUser({ id: userId, spaceRole: userId === "space-admin" ? "SpaceAdmin" : "SpaceMember" });
    }
    repository.seedProject({
      id: "project-1",
      members: [
        { userId: "project-owner", role: "ProjectOwner" },
        { userId: "project-editor", role: "ProjectEditor" },
        { userId: "project-viewer", role: "ProjectViewer" }
      ]
    });
    service = createDocumentService(repository, createPermissionFacade(repository));
  });

  it("creates notebook documents for the owner only and starts with an empty snapshot", async () => {
    const response = await service.createNotebookDocument({
      actor: actor("notebook-owner"),
      title: "  Lab notebook  "
    });

    expect(response.document).toMatchObject({
      id: "document-1",
      type: "notebook",
      status: "active",
      title: "Lab notebook",
      ownerUserId: "notebook-owner",
      projectId: null,
      revisionNumber: 0,
      currentRevisionId: null
    });
    expect(response.revision).toBeNull();
    expect(response.currentSnapshot).toEqual(createEmptyEditorSnapshot());
    await expect(service.readDocument(actor("notebook-owner"), response.document.id)).resolves.toMatchObject({
      document: { id: response.document.id }
    });
    await expectRejectedWithStatus(service.readDocument(actor("project-owner"), response.document.id), 404);
    expectMetadataOnly(expectAuditEvent(repository.auditEvents[0]));
  });

  it("allows project owner and editor creation while denying viewer non-member and SpaceAdmin bypass", async () => {
    await expect(
      service.createProjectDocument({
        actor: actor("project-owner"),
        projectId: "project-1",
        title: "Owner document"
      })
    ).resolves.toMatchObject({ document: { type: "project", projectId: "project-1" } });
    await expect(
      service.createProjectDocument({
        actor: actor("project-editor"),
        projectId: "project-1",
        title: "Editor document"
      })
    ).resolves.toMatchObject({ document: { type: "project", projectId: "project-1" } });
    await expectRejectedWithStatus(
      service.createProjectDocument({
        actor: actor("project-viewer"),
        projectId: "project-1",
        title: "Viewer document"
      }),
      403
    );
    await expectRejectedWithStatus(
      service.createProjectDocument({
        actor: actor("space-admin", "SpaceAdmin"),
        projectId: "project-1",
        title: "Admin document"
      }),
      403
    );
    await expectRejectedWithStatus(
      service.createProjectDocument({
        actor: actor("non-member"),
        projectId: "project-1",
        title: "Non-member document"
      }),
      403
    );
  });

  it("keeps project document reads member-only and fails closed for cross-space or malformed records", async () => {
    const created = await service.createProjectDocument({
      actor: actor("project-owner"),
      projectId: "project-1",
      title: "Project document"
    });
    const documentId = created.document.id;

    await expect(service.readDocument(actor("project-viewer"), documentId)).resolves.toMatchObject({
      document: { id: documentId },
      currentSnapshot: createEmptyEditorSnapshot()
    });
    await expectRejectedWithStatus(service.readDocument(actor("non-member"), documentId), 404);
    await expectRejectedWithStatus(service.readDocument(actor("space-admin", "SpaceAdmin"), documentId), 404);
    await expectRejectedWithStatus(service.readDocument(actor("project-owner", "SpaceMember", "space-2"), documentId), 404);

    repository.documents.set("malformed-project", {
      ...repository.documents.get(documentId)!,
      id: "malformed-project",
      ownerUserId: "project-owner"
    });
    await expectRejectedWithStatus(service.readDocument(actor("project-owner"), "malformed-project"), 404);
  });

  it("fails closed when the current revision points to another document", async () => {
    const firstDocument = await service.createNotebookDocument({
      actor: actor("notebook-owner"),
      title: "First"
    });
    const secondDocument = await service.createProjectDocument({
      actor: actor("project-owner"),
      projectId: "project-1",
      title: "Second"
    });
    const secondRevision = (await service.saveRevision({
      actor: actor("project-owner"),
      documentId: secondDocument.document.id,
      baseRevision: 0,
      contentSnapshot: paragraphSnapshot
    })) as Extract<Awaited<ReturnType<DocumentService["saveRevision"]>>, { outcome: "saved" }>;
    const firstRecord = repository.documents.get(firstDocument.document.id)!;

    repository.documents.set(firstRecord.id, {
      ...firstRecord,
      currentRevisionId: secondRevision.revision.id,
      currentRevision: repository.revisions.get(secondRevision.revision.id)!,
      revisionNumber: secondRevision.revision.revisionNumber
    });

    await expectRejectedWithStatus(service.readDocument(actor("notebook-owner"), firstRecord.id), 404);
    await expectRejectedWithStatus(
      service.saveDraft({
        actor: actor("notebook-owner"),
        documentId: firstRecord.id,
        baseRevision: 1,
        draftContent: updatedSnapshot
      }),
      404
    );
  });

  it("maps stored snapshot normalization failures to not found", async () => {
    const brokenRepository = new BrokenStoredSnapshotRepository();
    brokenRepository.seedUser({ id: "notebook-owner" });
    const brokenService = createDocumentService(
      brokenRepository,
      createPermissionFacade(brokenRepository)
    );
    const created = await brokenService.createNotebookDocument({
      actor: actor("notebook-owner"),
      title: "Broken stored snapshot"
    });

    await brokenService.saveRevision({
      actor: actor("notebook-owner"),
      documentId: created.document.id,
      baseRevision: 0,
      contentSnapshot: paragraphSnapshot
    });

    await expectRejectedWithStatus(
      brokenService.readDocument(actor("notebook-owner"), created.document.id),
      404
    );
  });

  it("autosaves exactly one draft per document user without creating revisions", async () => {
    const created = await service.createNotebookDocument({ actor: actor("notebook-owner"), title: "Drafts" });
    const documentId = created.document.id;

    await service.saveDraft({
      actor: actor("notebook-owner"),
      documentId,
      baseRevision: 0,
      draftContent: paragraphSnapshot
    });
    const response = await service.saveDraft({
      actor: actor("notebook-owner"),
      documentId,
      baseRevision: 0,
      draftContent: updatedSnapshot
    });

    expect(response.draft).toMatchObject({
      documentId,
      userId: "notebook-owner",
      baseRevision: 0,
      draftContent: updatedSnapshot
    });
    expect(repository.drafts).toHaveLength(1);
    expect(repository.revisions).toHaveLength(0);
    expect(repository.documents.get(documentId)).toMatchObject({
      revisionNumber: 0,
      currentRevisionId: null
    });
  });

  it("creates full formal revisions clears actor drafts and preserves conflict snapshots", async () => {
    const created = await service.createProjectDocument({
      actor: actor("project-owner"),
      projectId: "project-1",
      title: "Project writing"
    });
    const documentId = created.document.id;

    await service.saveDraft({
      actor: actor("project-editor"),
      documentId,
      baseRevision: 0,
      draftContent: paragraphSnapshot
    });
    const saved = await service.saveRevision({
      actor: actor("project-editor"),
      documentId,
      baseRevision: 0,
      contentSnapshot: paragraphSnapshot,
      title: "Updated title"
    });

    expect(saved).toMatchObject({
      outcome: "saved",
      document: { revisionNumber: 1, currentRevisionId: "revision-1", title: "Updated title" },
      revision: { revisionNumber: 1, contentSnapshot: paragraphSnapshot, editorUserId: "project-editor" }
    });
    expect(repository.drafts.has(`${documentId}:project-editor`)).toBe(false);
    expect(repository.revisions.get("revision-1")?.contentSnapshot).toEqual(paragraphSnapshot);

    const conflictResponse = await service.saveRevision({
      actor: actor("project-owner"),
      documentId,
      baseRevision: 0,
      contentSnapshot: updatedSnapshot
    });

    expect(conflictResponse).toEqual({
      outcome: "conflict",
      documentId,
      currentRevisionNumber: 1,
      currentSnapshot: paragraphSnapshot,
      submittedBaseRevision: 0,
      submittedSnapshot: updatedSnapshot
    });
    expect(repository.revisions).toHaveLength(1);
    expect(repository.documents.get(documentId)?.revisionNumber).toBe(1);
    repository.auditEvents.forEach(expectMetadataOnly);
  });

  it("denies ProjectViewer edits and rejects archived document saves", async () => {
    const created = await service.createProjectDocument({
      actor: actor("project-owner"),
      projectId: "project-1",
      title: "Read only"
    });
    const documentId = created.document.id;

    await expectRejectedWithStatus(
      service.saveDraft({
        actor: actor("project-viewer"),
        documentId,
        baseRevision: 0,
        draftContent: paragraphSnapshot
      }),
      403
    );
    await service.archiveDocument({ actor: actor("project-owner"), documentId });
    await expectRejectedWithStatus(
      service.saveDraft({
        actor: actor("project-editor"),
        documentId,
        baseRevision: 0,
        draftContent: paragraphSnapshot
      }),
      409
    );
    await expectRejectedWithStatus(
      service.saveRevision({
        actor: actor("project-editor"),
        documentId,
        baseRevision: 0,
        contentSnapshot: paragraphSnapshot
      }),
      409
    );
  });

  it("rejects archived saves even if an injected permission adapter allows edits", async () => {
    const permissiveService = createDocumentService(repository, {
      canReadDocument: async () => true,
      canEditDocument: async () => true,
      canArchiveDocument: async () => true,
      canHardDeleteDocument: async () => true
    });
    const created = await permissiveService.createNotebookDocument({
      actor: actor("notebook-owner"),
      title: "Archived guard"
    });
    const documentId = created.document.id;

    await permissiveService.archiveDocument({ actor: actor("notebook-owner"), documentId });

    await expectRejectedWithStatus(
      permissiveService.saveDraft({
        actor: actor("notebook-owner"),
        documentId,
        baseRevision: 0,
        draftContent: paragraphSnapshot
      }),
      409
    );
    await expectRejectedWithStatus(
      permissiveService.saveRevision({
        actor: actor("notebook-owner"),
        documentId,
        baseRevision: 0,
        contentSnapshot: paragraphSnapshot
      }),
      409
    );
  });

  it("applies owner-only notebook lifecycle and ProjectOwner-only project lifecycle", async () => {
    const notebook = await service.createNotebookDocument({ actor: actor("notebook-owner"), title: "Life" });
    await expectRejectedWithStatus(
      service.archiveDocument({ actor: actor("project-owner"), documentId: notebook.document.id }),
      403
    );
    await expect(service.archiveDocument({ actor: actor("notebook-owner"), documentId: notebook.document.id })).resolves
      .toMatchObject({ document: { status: "archived" } });
    await expect(service.restoreDocument({ actor: actor("notebook-owner"), documentId: notebook.document.id })).resolves
      .toMatchObject({ document: { status: "active" } });

    const projectDocument = await service.createProjectDocument({
      actor: actor("project-owner"),
      projectId: "project-1",
      title: "Project lifecycle"
    });
    await expectRejectedWithStatus(
      service.archiveDocument({ actor: actor("project-editor"), documentId: projectDocument.document.id }),
      403
    );
    await expectRejectedWithStatus(
      service.restoreDocument({ actor: actor("project-viewer"), documentId: projectDocument.document.id }),
      403
    );
    await expect(service.archiveDocument({ actor: actor("project-owner"), documentId: projectDocument.document.id }))
      .resolves.toMatchObject({ document: { status: "archived" } });
    await expect(service.restoreDocument({ actor: actor("project-owner"), documentId: projectDocument.document.id }))
      .resolves.toMatchObject({ document: { status: "active" } });
  });

  it("requires hard-delete confirmation and deletes document rows with metadata-only audit", async () => {
    const created = await service.createProjectDocument({
      actor: actor("project-owner"),
      projectId: "project-1",
      title: "Delete me"
    });
    const documentId = created.document.id;

    await service.saveDraft({
      actor: actor("project-owner"),
      documentId,
      baseRevision: 0,
      draftContent: paragraphSnapshot
    });
    await service.saveRevision({
      actor: actor("project-owner"),
      documentId,
      baseRevision: 0,
      contentSnapshot: paragraphSnapshot
    });
    await service.saveDraft({
      actor: actor("project-editor"),
      documentId,
      baseRevision: 1,
      draftContent: updatedSnapshot
    });
    repository.seedAttachment(documentId);

    await expectRejectedWithStatus(
      service.hardDeleteDocument({
        actor: actor("project-owner"),
        documentId,
        confirmation: "delete" as typeof documentHardDeleteConfirmation
      }),
      400
    );
    await expectRejectedWithStatus(
      service.hardDeleteDocument({
        actor: actor("project-editor"),
        documentId,
        confirmation: documentHardDeleteConfirmation
      }),
      403
    );

    const response = await service.hardDeleteDocument({
      actor: actor("project-owner"),
      documentId,
      confirmation: documentHardDeleteConfirmation
    });

    expect(response).toMatchObject({ documentId });
    expect(repository.documents.has(documentId)).toBe(false);
    expect(repository.drafts).toHaveLength(0);
    expect(repository.revisions).toHaveLength(0);
    expect(repository.attachments).toHaveLength(0);
    const auditEvent = expectAuditEvent(repository.auditEvents[repository.auditEvents.length - 1]);
    expect(auditEvent).toMatchObject({
      action: "document.hard_deleted",
      metadata: {
        deletedDraftCount: 1,
        deletedRevisionCount: 1,
        deletedAttachmentCount: 1
      }
    });
    expectMetadataOnly(auditEvent);
  });
});

describe("PrismaDocumentRepository", () => {
  it("converts concurrent revision unique races into conflicts", async () => {
    const createdAt = new Date("2026-06-14T12:30:00.000Z");
    const initialDocument = {
      id: "document-race",
      type: "notebook" as const,
      status: "active" as const,
      title: "Race",
      ownerUserId: "notebook-owner",
      projectId: null,
      currentRevisionId: null,
      revisionNumber: 0,
      createdAt,
      updatedAt: createdAt,
      project: null,
      currentRevision: null
    };
    const currentRevision = {
      id: "revision-race-1",
      documentId: "document-race",
      revisionNumber: 1,
      contentSnapshot: paragraphSnapshot,
      editorUserId: "notebook-owner",
      createdAt
    };
    const conflictDocument = {
      ...initialDocument,
      currentRevisionId: currentRevision.id,
      revisionNumber: 1,
      currentRevision
    };
    const uniqueError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const prisma = {
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          document: {
            findUnique: async () => initialDocument
          },
          documentRevision: {
            create: async () => {
              throw uniqueError;
            }
          },
          documentDraft: {
            deleteMany: async () => ({ count: 0 })
          },
          auditEvent: {
            create: async () => ({})
          }
        }),
      document: {
        findUnique: async () => conflictDocument
      }
    } as unknown as ConstructorParameters<typeof PrismaDocumentRepository>[0];
    const repository = new PrismaDocumentRepository(prisma);

    const result = await repository.saveRevision({
      actorUserId: "notebook-owner",
      documentId: "document-race",
      baseRevision: 0,
      contentSnapshot: updatedSnapshot
    });

    expect(result).toMatchObject({
      outcome: "conflict",
      document: {
        id: "document-race",
        revisionNumber: 1,
        currentRevision: { id: "revision-race-1", contentSnapshot: paragraphSnapshot }
      }
    });
  });
});

describe("document routes", () => {
  let app: FastifyInstance | undefined;
  let repository: InMemoryDocumentRepository;
  let service: DocumentService;

  beforeEach(() => {
    repository = new InMemoryDocumentRepository();
    repository.seedUser({ id: "route-user" });
    service = createDocumentService(repository, createPermissionFacade(repository));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("registers routes without breaking health and requires authenticated actors", async () => {
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
      documents: {
        nodeEnv: "production",
        sessionCookieName: cookieName,
        authService: createRouteAuthService(sessions),
        documentService: service
      }
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });

    const unauthenticatedResponse = await app.inject({ method: "GET", url: "/documents/missing" });
    expect(unauthenticatedResponse.statusCode).toBe(401);

    const createResponse = await app.inject({
      method: "POST",
      url: "/documents/notebook",
      headers: { cookie: `${cookieName}=route-session` },
      payload: { title: "Route notebook" }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      document: { id: "document-1", type: "notebook", title: "Route notebook" },
      currentSnapshot: createEmptyEditorSnapshot()
    });

    const saveResponse = await app.inject({
      method: "POST",
      url: "/documents/document-1/revisions",
      headers: { cookie: `${cookieName}=route-session` },
      payload: { baseRevision: 0, contentSnapshot: paragraphSnapshot }
    });
    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toMatchObject({
      outcome: "saved",
      revision: { revisionNumber: 1, contentSnapshot: paragraphSnapshot }
    });

    const staleResponse = await app.inject({
      method: "POST",
      url: "/documents/document-1/revisions",
      headers: { cookie: `${cookieName}=route-session` },
      payload: { baseRevision: 0, contentSnapshot: updatedSnapshot }
    });
    expect(staleResponse.statusCode).toBe(409);
    expect(staleResponse.json()).toMatchObject({
      outcome: "conflict",
      currentRevisionNumber: 1,
      submittedBaseRevision: 0
    });
  });
});
