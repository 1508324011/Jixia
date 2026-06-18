import type { Prisma, PrismaClient } from "@jixia/db/generated";
import type {
  ProjectDTO,
  ProjectMembershipDTO,
  ProjectMemberUserView,
  ProjectRole,
  SpaceRole
} from "@jixia/shared";

import { ensureMetadataOnlyAuditPayload } from "../audit/audit.service.js";

export class ProjectError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

export type ProjectActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type ProjectRecord = {
  readonly id: string;
  readonly spaceId: string;
  readonly name: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type ProjectMemberRecord = {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: ProjectRole;
  readonly createdAt: Date;
  readonly member: ProjectMemberUserView;
};

export type SpaceMemberRecord = {
  readonly userId: string;
  readonly spaceId: string;
  readonly role: SpaceRole;
};

export type AuditEventRecord = {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly metadata: Record<string, unknown>;
};

export type CreateProjectInput = {
  readonly actor: ProjectActor;
  readonly name: string;
};

export type AddProjectMemberInput = {
  readonly actor: ProjectActor;
  readonly projectId: string;
  readonly userId: string;
  readonly role: ProjectRole;
};

export type UpdateProjectMemberInput = AddProjectMemberInput;

export type RemoveProjectMemberInput = {
  readonly actor: ProjectActor;
  readonly projectId: string;
  readonly userId: string;
};

export type ProjectRepository = {
  readonly listProjectsForMember: (input: {
    readonly spaceId: string;
    readonly userId: string;
  }) => Promise<readonly ProjectRecord[]>;
  readonly findProjectById: (projectId: string) => Promise<ProjectRecord | null>;
  readonly findSpaceMembership: (input: {
    readonly spaceId: string;
    readonly userId: string;
  }) => Promise<SpaceMemberRecord | null>;
  readonly findProjectMembership: (input: {
    readonly projectId: string;
    readonly userId: string;
  }) => Promise<ProjectMemberRecord | null>;
  readonly listProjectMembers: (projectId: string) => Promise<readonly ProjectMemberRecord[]>;
  readonly createProjectWithOwner: (input: {
    readonly spaceId: string;
    readonly actorUserId: string;
    readonly name: string;
  }) => Promise<{ readonly project: ProjectRecord; readonly membership: ProjectMemberRecord }>;
  readonly addProjectMember: (input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly role: ProjectRole;
  }) => Promise<ProjectMemberRecord>;
  readonly updateProjectMemberRole: (input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly role: ProjectRole;
  }) => Promise<ProjectMemberRecord>;
  readonly removeProjectMember: (input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
  }) => Promise<ProjectMemberRecord>;
  readonly auditEvents: readonly AuditEventRecord[];
};

const projectRolesSet = new Set<ProjectRole>([
  "ProjectOwner",
  "ProjectEditor",
  "ProjectViewer"
]);
const addableProjectRolesSet = new Set<ProjectRole>(["ProjectEditor", "ProjectViewer"]);

function badRequest(message = "Invalid request"): ProjectError {
  return new ProjectError(message, 400);
}

function forbidden(message = "Forbidden"): ProjectError {
  return new ProjectError(message, 403);
}

function notFound(message = "Not found"): ProjectError {
  return new ProjectError(message, 404);
}

function conflict(message = "Resource conflict"): ProjectError {
  return new ProjectError(message, 409);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function toProjectDTO(project: ProjectRecord): ProjectDTO {
  return {
    id: project.id,
    spaceId: project.spaceId,
    name: project.name,
    createdByUserId: project.createdByUserId,
    createdAt: toIsoString(project.createdAt),
    updatedAt: toIsoString(project.updatedAt)
  };
}

function toProjectMembershipDTO(membership: ProjectMemberRecord): ProjectMembershipDTO {
  return {
    id: membership.id,
    projectId: membership.projectId,
    userId: membership.userId,
    role: membership.role,
    member: membership.member,
    createdAt: toIsoString(membership.createdAt)
  };
}

function ensureProjectRole(role: ProjectRole): void {
  if (!projectRolesSet.has(role)) {
    throw badRequest("Invalid project role");
  }
}

function ensureAddableProjectRole(role: ProjectRole): void {
  ensureProjectRole(role);

  if (!addableProjectRolesSet.has(role)) {
    throw badRequest("Invalid project role");
  }
}

function ensureAuditMetadata(metadata: Record<string, unknown>): void {
  ensureMetadataOnlyAuditPayload(metadata);
}

function ensureActiveSpaceMember(actor: ProjectActor): void {
  if (!actor.spaceId || !actor.userId || !actor.spaceRole) {
    throw forbidden();
  }
}

function ensureProjectInActorSpace(project: ProjectRecord | null, actor: ProjectActor): ProjectRecord {
  if (!project || project.spaceId !== actor.spaceId) {
    throw notFound();
  }

  return project;
}

function ensureProjectMember(
  membership: ProjectMemberRecord | null,
  message = "Project membership required"
): ProjectMemberRecord {
  if (!membership) {
    throw forbidden(message);
  }

  return membership;
}

function ensureProjectOwner(membership: ProjectMemberRecord | null): ProjectMemberRecord {
  const projectMembership = ensureProjectMember(membership, "ProjectOwner role required");

  if (projectMembership.role !== "ProjectOwner") {
    throw forbidden("ProjectOwner role required");
  }

  return projectMembership;
}

function ensureOwnerContinuity(
  currentMembership: ProjectMemberRecord,
  members: readonly ProjectMemberRecord[],
  nextRole?: ProjectRole
): void {
  if (currentMembership.role !== "ProjectOwner") {
    return;
  }

  if (nextRole === "ProjectOwner") {
    return;
  }

  const remainingOwners = members.filter(
    (membership) => membership.userId !== currentMembership.userId && membership.role === "ProjectOwner"
  );

  if (remainingOwners.length === 0) {
    throw conflict("Project must keep at least one owner");
  }
}

function ensureValidName(name: string): string {
  const trimmedName = name.trim();

  if (!trimmedName || trimmedName.length > 200) {
    throw badRequest("Invalid project name");
  }

  return trimmedName;
}

function toProjectMemberRecord(record: {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: string;
  readonly createdAt: Date;
  readonly user: ProjectMemberUserView;
}): ProjectMemberRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    userId: record.userId,
    role: record.role as ProjectRole,
    member: record.user,
    createdAt: record.createdAt
  };
}

const projectSelect = {
  id: true,
  spaceId: true,
  name: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ProjectSelect;

const projectMemberInclude = {
  user: {
    select: {
      id: true,
      email: true,
      displayName: true
    }
  }
} satisfies Prisma.ProjectMemberInclude;

type PrismaTransaction = Prisma.TransactionClient;

export class PrismaProjectRepository implements ProjectRepository {
  readonly auditEvents: readonly AuditEventRecord[] = [];

  constructor(private readonly prisma: PrismaClient) {}

  async listProjectsForMember(input: {
    readonly spaceId: string;
    readonly userId: string;
  }): Promise<readonly ProjectRecord[]> {
    return this.prisma.project.findMany({
      where: {
        spaceId: input.spaceId,
        members: {
          some: {
            userId: input.userId
          }
        }
      },
      orderBy: { createdAt: "asc" },
      select: projectSelect
    });
  }

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    return this.prisma.project.findUnique({
      where: { id: projectId },
      select: projectSelect
    });
  }

  async findSpaceMembership(input: {
    readonly spaceId: string;
    readonly userId: string;
  }): Promise<SpaceMemberRecord | null> {
    const membership = await this.prisma.spaceMember.findUnique({
      where: {
        spaceId_userId: {
          spaceId: input.spaceId,
          userId: input.userId
        }
      },
      select: {
        spaceId: true,
        userId: true,
        role: true
      }
    });

    return membership ? { ...membership, role: membership.role as SpaceRole } : null;
  }

  async findProjectMembership(input: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<ProjectMemberRecord | null> {
    const membership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: input.projectId,
          userId: input.userId
        }
      },
      include: projectMemberInclude
    });

    return membership ? toProjectMemberRecord(membership) : null;
  }

  async listProjectMembers(projectId: string): Promise<readonly ProjectMemberRecord[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: projectMemberInclude
    });

    return memberships.map(toProjectMemberRecord);
  }

  async createProjectWithOwner(input: {
    readonly spaceId: string;
    readonly actorUserId: string;
    readonly name: string;
  }): Promise<{ readonly project: ProjectRecord; readonly membership: ProjectMemberRecord }> {
    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          spaceId: input.spaceId,
          name: input.name,
          createdByUserId: input.actorUserId
        },
        select: projectSelect
      });
      const membership = await transaction.projectMember.create({
        data: {
          projectId: project.id,
          userId: input.actorUserId,
          role: "ProjectOwner"
        },
        include: projectMemberInclude
      });

      await this.writeAuditEvent(transaction, {
        actorUserId: input.actorUserId,
        action: "project.created",
        targetType: "Project",
        targetId: project.id,
        metadata: {
          projectId: project.id,
          spaceId: input.spaceId,
          createdByUserId: input.actorUserId,
          name: input.name
        }
      });

      return {
        project,
        membership: toProjectMemberRecord(membership)
      };
    });
  }

  async addProjectMember(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly role: ProjectRole;
  }): Promise<ProjectMemberRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.projectMember.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          role: input.role
        },
        include: projectMemberInclude
      });

      await this.writeAuditEvent(transaction, {
        actorUserId: input.actorUserId,
        action: "project_member.added",
        targetType: "ProjectMember",
        targetId: membership.id,
        metadata: {
          projectId: input.projectId,
          userId: input.userId,
          role: input.role
        }
      });

      return toProjectMemberRecord(membership);
    });
  }

  async updateProjectMemberRole(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly role: ProjectRole;
  }): Promise<ProjectMemberRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.projectMember.update({
        where: {
          projectId_userId: {
            projectId: input.projectId,
            userId: input.userId
          }
        },
        data: { role: input.role },
        include: projectMemberInclude
      });

      await this.writeAuditEvent(transaction, {
        actorUserId: input.actorUserId,
        action: "project_member.role_updated",
        targetType: "ProjectMember",
        targetId: membership.id,
        metadata: {
          projectId: input.projectId,
          userId: input.userId,
          role: input.role
        }
      });

      return toProjectMemberRecord(membership);
    });
  }

  async removeProjectMember(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
  }): Promise<ProjectMemberRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.projectMember.delete({
        where: {
          projectId_userId: {
            projectId: input.projectId,
            userId: input.userId
          }
        },
        include: projectMemberInclude
      });

      await this.writeAuditEvent(transaction, {
        actorUserId: input.actorUserId,
        action: "project_member.removed",
        targetType: "ProjectMember",
        targetId: membership.id,
        metadata: {
          projectId: input.projectId,
          userId: input.userId,
          removedRole: membership.role
        }
      });

      return toProjectMemberRecord(membership);
    });
  }

  private async writeAuditEvent(
    transaction: PrismaTransaction,
    event: AuditEventRecord & { readonly actorUserId: string }
  ): Promise<void> {
    ensureAuditMetadata(event.metadata);

    await transaction.auditEvent.create({
      data: {
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata as Prisma.InputJsonValue
      }
    });
  }
}

export function createProjectService(repository: ProjectRepository) {
  async function ensureActorSpaceMembership(actor: ProjectActor): Promise<void> {
    ensureActiveSpaceMember(actor);

    const membership = await repository.findSpaceMembership({
      spaceId: actor.spaceId,
      userId: actor.userId
    });

    if (!membership || membership.role !== actor.spaceRole) {
      throw forbidden();
    }
  }

  async function ensureReadableProject(actor: ProjectActor, projectId: string): Promise<ProjectRecord> {
    await ensureActorSpaceMembership(actor);
    const project = ensureProjectInActorSpace(await repository.findProjectById(projectId), actor);
    ensureProjectMember(
      await repository.findProjectMembership({ projectId: project.id, userId: actor.userId })
    );
    return project;
  }

  async function ensureManageableProject(actor: ProjectActor, projectId: string): Promise<ProjectRecord> {
    await ensureActorSpaceMembership(actor);
    const project = ensureProjectInActorSpace(await repository.findProjectById(projectId), actor);
    ensureProjectOwner(
      await repository.findProjectMembership({ projectId: project.id, userId: actor.userId })
    );
    return project;
  }

  async function ensureTargetSpaceMember(spaceId: string, userId: string): Promise<void> {
    const membership = await repository.findSpaceMembership({ spaceId, userId });

    if (!membership) {
      throw notFound();
    }
  }

  return {
    async listProjects(actor: ProjectActor): Promise<{ readonly projects: readonly ProjectDTO[] }> {
      await ensureActorSpaceMembership(actor);

      const projects = await repository.listProjectsForMember({
        spaceId: actor.spaceId,
        userId: actor.userId
      });

      return { projects: projects.map(toProjectDTO) };
    },

    async createProject(input: CreateProjectInput): Promise<{
      readonly project: ProjectDTO;
      readonly membership: ProjectMembershipDTO;
    }> {
      await ensureActorSpaceMembership(input.actor);
      const projectName = ensureValidName(input.name);
      const result = await repository.createProjectWithOwner({
        spaceId: input.actor.spaceId,
        actorUserId: input.actor.userId,
        name: projectName
      });

      return {
        project: toProjectDTO(result.project),
        membership: toProjectMembershipDTO(result.membership)
      };
    },

    async getProject(
      actor: ProjectActor,
      projectId: string
    ): Promise<{ readonly project: ProjectDTO }> {
      const project = await ensureReadableProject(actor, projectId);

      return { project: toProjectDTO(project) };
    },

    async listMembers(
      actor: ProjectActor,
      projectId: string
    ): Promise<{ readonly projectId: string; readonly members: readonly ProjectMembershipDTO[] }> {
      const project = await ensureReadableProject(actor, projectId);
      const members = await repository.listProjectMembers(project.id);

      return {
        projectId: project.id,
        members: members.map(toProjectMembershipDTO)
      };
    },

    async addMember(input: AddProjectMemberInput): Promise<{
      readonly membership: ProjectMembershipDTO;
    }> {
      ensureAddableProjectRole(input.role);
      const project = await ensureManageableProject(input.actor, input.projectId);
      await ensureTargetSpaceMember(project.spaceId, input.userId);

      if (await repository.findProjectMembership({ projectId: project.id, userId: input.userId })) {
        throw conflict("Project member already exists");
      }

      const membership = await repository.addProjectMember({
        actorUserId: input.actor.userId,
        projectId: project.id,
        userId: input.userId,
        role: input.role
      });

      return { membership: toProjectMembershipDTO(membership) };
    },

    async updateMember(input: UpdateProjectMemberInput): Promise<{
      readonly membership: ProjectMembershipDTO;
    }> {
      ensureProjectRole(input.role);
      const project = await ensureManageableProject(input.actor, input.projectId);
      await ensureTargetSpaceMember(project.spaceId, input.userId);
      const currentMembership = await repository.findProjectMembership({
        projectId: project.id,
        userId: input.userId
      });

      if (!currentMembership) {
        throw notFound();
      }

      ensureOwnerContinuity(currentMembership, await repository.listProjectMembers(project.id), input.role);

      const membership = await repository.updateProjectMemberRole({
        actorUserId: input.actor.userId,
        projectId: project.id,
        userId: input.userId,
        role: input.role
      });

      return { membership: toProjectMembershipDTO(membership) };
    },

    async removeMember(input: RemoveProjectMemberInput): Promise<{ readonly ok: true }> {
      const project = await ensureManageableProject(input.actor, input.projectId);
      await ensureTargetSpaceMember(project.spaceId, input.userId);
      const currentMembership = await repository.findProjectMembership({
        projectId: project.id,
        userId: input.userId
      });

      if (!currentMembership) {
        throw notFound();
      }

      ensureOwnerContinuity(currentMembership, await repository.listProjectMembers(project.id));

      await repository.removeProjectMember({
        actorUserId: input.actor.userId,
        projectId: project.id,
        userId: input.userId
      });

      return { ok: true };
    }
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;

let cachedService: ProjectService | undefined;

export async function getDefaultProjectService(): Promise<ProjectService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createProjectService(new PrismaProjectRepository(prisma));
  }

  return cachedService;
}
