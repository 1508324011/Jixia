import type { PrismaClient } from "@jixia/db/client";
import type { DocumentStatus, DocumentType, ProjectRole } from "@jixia/shared";

export type PermissionUserRecord = {
  readonly id: string;
};

export type PermissionDocumentRecord = {
  readonly type: DocumentType;
  readonly status: DocumentStatus;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
};

export type PermissionProjectMembershipRecord = {
  readonly role: ProjectRole;
};

export type PermissionAttachmentRecord = {
  readonly documentId: string;
};

export type PermissionRepository = {
  readonly findUserById: (userId: string) => Promise<PermissionUserRecord | null>;
  readonly findDocumentById: (documentId: string) => Promise<PermissionDocumentRecord | null>;
  readonly findProjectMembership: (
    userId: string,
    projectId: string
  ) => Promise<PermissionProjectMembershipRecord | null>;
  readonly findAttachmentById: (attachmentId: string) => Promise<PermissionAttachmentRecord | null>;
};

type DocumentPermissionAction = "read" | "edit" | "archive" | "hard-delete";

const projectEditorRoles = new Set<ProjectRole>(["ProjectOwner", "ProjectEditor"]);

export class PrismaPermissionRepository implements PermissionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserById(userId: string): Promise<PermissionUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    return user;
  }

  async findDocumentById(documentId: string): Promise<PermissionDocumentRecord | null> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: {
        type: true,
        status: true,
        ownerUserId: true,
        projectId: true
      }
    });

    return document;
  }

  async findProjectMembership(
    userId: string,
    projectId: string
  ): Promise<PermissionProjectMembershipRecord | null> {
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      },
      select: { role: true }
    });

    return membership;
  }

  async findAttachmentById(attachmentId: string): Promise<PermissionAttachmentRecord | null> {
    const attachment = await this.prisma.documentAttachment.findUnique({
      where: { id: attachmentId },
      select: { documentId: true }
    });

    return attachment;
  }
}

export function createPermissionService(repository: PermissionRepository) {
  async function failClosed(check: () => Promise<boolean>): Promise<boolean> {
    try {
      return await check();
    } catch {
      return false;
    }
  }

  function isValidDocumentContext(document: PermissionDocumentRecord): boolean {
    if (document.type === "notebook") {
      return document.ownerUserId !== null && document.projectId === null;
    }

    if (document.type === "project") {
      return document.ownerUserId === null && document.projectId !== null;
    }

    return false;
  }

  async function decideDocumentPermission(
    userId: string,
    documentId: string,
    action: DocumentPermissionAction
  ): Promise<boolean> {
    const user = await repository.findUserById(userId);

    if (!user) {
      return false;
    }

    const document = await repository.findDocumentById(documentId);

    if (!document || !isValidDocumentContext(document)) {
      return false;
    }

    if (action === "edit" && document.status !== "active") {
      return false;
    }

    if (document.type === "notebook") {
      return document.ownerUserId === userId;
    }

    if (!document.projectId) {
      return false;
    }

    const membership = await repository.findProjectMembership(userId, document.projectId);

    if (!membership) {
      return false;
    }

    switch (action) {
      case "read":
        return true;
      case "edit":
        return projectEditorRoles.has(membership.role);
      case "archive":
      case "hard-delete":
        return membership.role === "ProjectOwner";
    }
  }

  return {
    async canReadDocument(userId: string, documentId: string): Promise<boolean> {
      return failClosed(() => decideDocumentPermission(userId, documentId, "read"));
    },

    async canEditDocument(userId: string, documentId: string): Promise<boolean> {
      return failClosed(() => decideDocumentPermission(userId, documentId, "edit"));
    },

    async canArchiveDocument(userId: string, documentId: string): Promise<boolean> {
      return failClosed(() => decideDocumentPermission(userId, documentId, "archive"));
    },

    async canHardDeleteDocument(userId: string, documentId: string): Promise<boolean> {
      return failClosed(() => decideDocumentPermission(userId, documentId, "hard-delete"));
    },

    async canDownloadAttachment(userId: string, attachmentId: string): Promise<boolean> {
      return failClosed(async () => {
        const attachment = await repository.findAttachmentById(attachmentId);

        if (!attachment) {
          return false;
        }

        return decideDocumentPermission(userId, attachment.documentId, "read");
      });
    }
  };
}

export type PermissionService = ReturnType<typeof createPermissionService>;

let cachedService: PermissionService | undefined;

async function getDefaultPermissionService(): Promise<PermissionService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createPermissionService(new PrismaPermissionRepository(prisma));
  }

  return cachedService;
}

export async function canReadDocument(userId: string, documentId: string): Promise<boolean> {
  return (await getDefaultPermissionService()).canReadDocument(userId, documentId);
}

export async function canEditDocument(userId: string, documentId: string): Promise<boolean> {
  return (await getDefaultPermissionService()).canEditDocument(userId, documentId);
}

export async function canArchiveDocument(userId: string, documentId: string): Promise<boolean> {
  return (await getDefaultPermissionService()).canArchiveDocument(userId, documentId);
}

export async function canHardDeleteDocument(userId: string, documentId: string): Promise<boolean> {
  return (await getDefaultPermissionService()).canHardDeleteDocument(userId, documentId);
}

export async function canDownloadAttachment(userId: string, attachmentId: string): Promise<boolean> {
  return (await getDefaultPermissionService()).canDownloadAttachment(userId, attachmentId);
}
