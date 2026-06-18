import type { ProjectRole } from "@jixia/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  canArchiveDocument,
  canDownloadAttachment,
  canEditDocument,
  canHardDeleteDocument,
  canReadDocument,
  createPermissionService,
  type PermissionAttachmentRecord,
  type PermissionDocumentRecord,
  type PermissionProjectMembershipRecord,
  type PermissionRepository,
  type PermissionService,
  type PermissionUserRecord
} from "./permission.service.js";

const projectId = "project-1";

class InMemoryPermissionRepository implements PermissionRepository {
  readonly users = new Set<string>();
  readonly documents = new Map<string, PermissionDocumentRecord>();
  readonly memberships = new Map<string, PermissionProjectMembershipRecord>();
  readonly attachments = new Map<string, PermissionAttachmentRecord>();
  throwOnAccess = false;

  async findUserById(userId: string): Promise<PermissionUserRecord | null> {
    this.maybeThrow();
    return this.users.has(userId) ? { id: userId } : null;
  }

  async findDocumentById(documentId: string): Promise<PermissionDocumentRecord | null> {
    this.maybeThrow();
    return this.documents.get(documentId) ?? null;
  }

  async findProjectMembership(
    userId: string,
    membershipProjectId: string
  ): Promise<PermissionProjectMembershipRecord | null> {
    this.maybeThrow();
    return this.memberships.get(this.membershipKey(userId, membershipProjectId)) ?? null;
  }

  async findAttachmentById(attachmentId: string): Promise<PermissionAttachmentRecord | null> {
    this.maybeThrow();
    return this.attachments.get(attachmentId) ?? null;
  }

  seedUser(userId: string): void {
    this.users.add(userId);
  }

  seedProjectMembership(userId: string, role: ProjectRole): void {
    this.memberships.set(this.membershipKey(userId, projectId), { role });
  }

  private membershipKey(userId: string, membershipProjectId: string): string {
    return `${membershipProjectId}:${userId}`;
  }

  private maybeThrow(): void {
    if (this.throwOnAccess) {
      throw new Error("permission repository unavailable");
    }
  }
}

type DocumentPermissions = {
  readonly read: boolean;
  readonly edit: boolean;
  readonly archive: boolean;
  readonly hardDelete: boolean;
};

function notebookDocument(ownerUserId: string | null, status: "active" | "archived" = "active") {
  return {
    type: "notebook" as const,
    status,
    ownerUserId,
    projectId: null
  };
}

function projectDocument(projectIdValue: string | null, status: "active" | "archived" = "active") {
  return {
    type: "project" as const,
    status,
    ownerUserId: null,
    projectId: projectIdValue
  };
}

async function expectDocumentPermissions(
  service: PermissionService,
  userId: string,
  documentId: string,
  expected: DocumentPermissions
): Promise<void> {
  await expect(service.canReadDocument(userId, documentId)).resolves.toBe(expected.read);
  await expect(service.canEditDocument(userId, documentId)).resolves.toBe(expected.edit);
  await expect(service.canArchiveDocument(userId, documentId)).resolves.toBe(expected.archive);
  await expect(service.canHardDeleteDocument(userId, documentId)).resolves.toBe(expected.hardDelete);
}

describe("permission service", () => {
  let repository: InMemoryPermissionRepository;
  let service: PermissionService;

  beforeEach(() => {
    repository = new InMemoryPermissionRepository();
    service = createPermissionService(repository);

    for (const userId of [
      "notebook-owner",
      "project-owner",
      "project-editor",
      "project-viewer",
      "non-member",
      "space-admin",
      "attachment-uploader"
    ]) {
      repository.seedUser(userId);
    }

    repository.seedProjectMembership("project-owner", "ProjectOwner");
    repository.seedProjectMembership("project-editor", "ProjectEditor");
    repository.seedProjectMembership("project-viewer", "ProjectViewer");

    repository.documents.set("notebook-active", notebookDocument("notebook-owner"));
    repository.documents.set("notebook-archived", notebookDocument("notebook-owner", "archived"));
    repository.documents.set("project-active", projectDocument(projectId));
    repository.documents.set("project-archived", projectDocument(projectId, "archived"));
    repository.documents.set("malformed-notebook", { ...notebookDocument("notebook-owner"), projectId });
    repository.documents.set("malformed-project", projectDocument(null));
    repository.attachments.set("project-attachment", { documentId: "project-active" });
    repository.attachments.set("notebook-attachment", { documentId: "notebook-active" });
    repository.attachments.set("malformed-attachment", { documentId: "malformed-project" });
  });

  it("exports the required async boolean permission functions", () => {
    expect(typeof canReadDocument).toBe("function");
    expect(typeof canEditDocument).toBe("function");
    expect(typeof canArchiveDocument).toBe("function");
    expect(typeof canHardDeleteDocument).toBe("function");
    expect(typeof canDownloadAttachment).toBe("function");
  });

  it("allows notebook documents only for the owner and denies archived edits", async () => {
    await expectDocumentPermissions(service, "notebook-owner", "notebook-active", {
      read: true,
      edit: true,
      archive: true,
      hardDelete: true
    });
    await expectDocumentPermissions(service, "project-owner", "notebook-active", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expectDocumentPermissions(service, "space-admin", "notebook-active", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expectDocumentPermissions(service, "notebook-owner", "notebook-archived", {
      read: true,
      edit: false,
      archive: true,
      hardDelete: true
    });
  });

  it("applies project owner editor viewer and non-member permissions", async () => {
    await expectDocumentPermissions(service, "project-owner", "project-active", {
      read: true,
      edit: true,
      archive: true,
      hardDelete: true
    });
    await expectDocumentPermissions(service, "project-editor", "project-active", {
      read: true,
      edit: true,
      archive: false,
      hardDelete: false
    });
    await expectDocumentPermissions(service, "project-viewer", "project-active", {
      read: true,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expectDocumentPermissions(service, "non-member", "project-active", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
  });

  it("does not grant SpaceAdmin project content access unless project membership also exists", async () => {
    await expectDocumentPermissions(service, "space-admin", "project-active", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });

    repository.seedProjectMembership("space-admin", "ProjectEditor");

    await expectDocumentPermissions(service, "space-admin", "project-active", {
      read: true,
      edit: true,
      archive: false,
      hardDelete: false
    });
  });

  it("denies editing archived project documents while preserving owner lifecycle authority", async () => {
    await expectDocumentPermissions(service, "project-owner", "project-archived", {
      read: true,
      edit: false,
      archive: true,
      hardDelete: true
    });
    await expectDocumentPermissions(service, "project-editor", "project-archived", {
      read: true,
      edit: false,
      archive: false,
      hardDelete: false
    });
  });

  it("inherits attachment download permission from the owning document only", async () => {
    await expect(service.canDownloadAttachment("project-viewer", "project-attachment")).resolves.toBe(true);
    await expect(service.canDownloadAttachment("non-member", "project-attachment")).resolves.toBe(false);
    await expect(service.canDownloadAttachment("attachment-uploader", "project-attachment")).resolves.toBe(
      false
    );
    await expect(service.canDownloadAttachment("notebook-owner", "notebook-attachment")).resolves.toBe(true);
    await expect(service.canDownloadAttachment("project-owner", "notebook-attachment")).resolves.toBe(false);
  });

  it("fails closed for missing users records memberships and malformed invariant contexts", async () => {
    await expectDocumentPermissions(service, "missing-user", "notebook-active", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expectDocumentPermissions(service, "notebook-owner", "missing-document", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expectDocumentPermissions(service, "notebook-owner", "malformed-notebook", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expectDocumentPermissions(service, "project-owner", "malformed-project", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expect(service.canDownloadAttachment("project-owner", "missing-attachment")).resolves.toBe(false);
    await expect(service.canDownloadAttachment("project-owner", "malformed-attachment")).resolves.toBe(false);
  });

  it("fails closed on repository errors", async () => {
    repository.throwOnAccess = true;

    await expectDocumentPermissions(service, "project-owner", "project-active", {
      read: false,
      edit: false,
      archive: false,
      hardDelete: false
    });
    await expect(service.canDownloadAttachment("project-owner", "project-attachment")).resolves.toBe(false);
  });
});
