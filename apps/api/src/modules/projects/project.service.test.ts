import type { CurrentSessionView, ProjectRole, SpaceRole } from "@jixia/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { unauthorized } from "../auth/errors.js";
import type { AuthSessionRecord, AuthUserRecord } from "../auth/repository.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import { createTestApiApp } from "../../test-utils/app.js";
import {
  createProjectService,
  ProjectError,
  type AuditEventRecord,
  type ProjectActor,
  type ProjectMemberRecord,
  type ProjectRecord,
  type ProjectRepository,
  type ProjectService,
  type SpaceMemberRecord
} from "./project.service.js";

const baseNow = new Date("2026-06-14T12:00:00.000Z");
const cookieName = "jixia_project_test_session";

type UserRecord = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
};

class InMemoryProjectRepository implements ProjectRepository {
  readonly users = new Map<string, UserRecord>();
  readonly spaceMembers = new Map<string, SpaceMemberRecord>();
  readonly projects = new Map<string, ProjectRecord>();
  readonly projectMembers = new Map<string, ProjectMemberRecord>();
  readonly auditEvents: AuditEventRecord[] = [];

  async listProjectsForMember(input: {
    readonly spaceId: string;
    readonly userId: string;
  }): Promise<readonly ProjectRecord[]> {
    const projectIds = new Set(
      Array.from(this.projectMembers.values())
        .filter((membership) => membership.userId === input.userId)
        .map((membership) => membership.projectId)
    );

    return Array.from(this.projects.values())
      .filter((project) => project.spaceId === input.spaceId && projectIds.has(project.id))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async findProjectById(projectId: string): Promise<ProjectRecord | null> {
    return this.projects.get(projectId) ?? null;
  }

  async findSpaceMembership(input: {
    readonly spaceId: string;
    readonly userId: string;
  }): Promise<SpaceMemberRecord | null> {
    return this.spaceMembers.get(this.spaceMemberKey(input.spaceId, input.userId)) ?? null;
  }

  async findProjectMembership(input: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<ProjectMemberRecord | null> {
    return this.projectMembers.get(this.projectMemberKey(input.projectId, input.userId)) ?? null;
  }

  async listProjectMembers(projectId: string): Promise<readonly ProjectMemberRecord[]> {
    return Array.from(this.projectMembers.values())
      .filter((membership) => membership.projectId === projectId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async createProjectWithOwner(input: {
    readonly spaceId: string;
    readonly actorUserId: string;
    readonly name: string;
  }): Promise<{ readonly project: ProjectRecord; readonly membership: ProjectMemberRecord }> {
    const project: ProjectRecord = {
      id: `project-${this.projects.size + 1}`,
      spaceId: input.spaceId,
      name: input.name,
      createdByUserId: input.actorUserId,
      createdAt: baseNow,
      updatedAt: baseNow
    };
    this.projects.set(project.id, project);
    const membership = this.createMembership(project.id, input.actorUserId, "ProjectOwner");

    this.auditEvents.push({
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

    return { project, membership };
  }

  async addProjectMember(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly role: ProjectRole;
  }): Promise<ProjectMemberRecord> {
    const membership = this.createMembership(input.projectId, input.userId, input.role);

    this.auditEvents.push({
      action: "project_member.added",
      targetType: "ProjectMember",
      targetId: membership.id,
      metadata: {
        projectId: input.projectId,
        userId: input.userId,
        role: input.role
      }
    });

    return membership;
  }

  async updateProjectMemberRole(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly role: ProjectRole;
  }): Promise<ProjectMemberRecord> {
    const key = this.projectMemberKey(input.projectId, input.userId);
    const current = this.projectMembers.get(key);

    if (!current) {
      throw new Error("test membership missing");
    }

    const updated: ProjectMemberRecord = { ...current, role: input.role };
    this.projectMembers.set(key, updated);
    this.auditEvents.push({
      action: "project_member.role_updated",
      targetType: "ProjectMember",
      targetId: updated.id,
      metadata: {
        projectId: input.projectId,
        userId: input.userId,
        role: input.role
      }
    });

    return updated;
  }

  async removeProjectMember(input: {
    readonly actorUserId: string;
    readonly projectId: string;
    readonly userId: string;
  }): Promise<ProjectMemberRecord> {
    const key = this.projectMemberKey(input.projectId, input.userId);
    const current = this.projectMembers.get(key);

    if (!current) {
      throw new Error("test membership missing");
    }

    this.projectMembers.delete(key);
    this.auditEvents.push({
      action: "project_member.removed",
      targetType: "ProjectMember",
      targetId: current.id,
      metadata: {
        projectId: input.projectId,
        userId: input.userId,
        removedRole: current.role
      }
    });

    return current;
  }

  seedUser(input: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly spaceId: string;
    readonly spaceRole: SpaceRole;
  }): void {
    this.users.set(input.id, {
      id: input.id,
      email: input.email,
      displayName: input.displayName
    });
    this.spaceMembers.set(this.spaceMemberKey(input.spaceId, input.id), {
      spaceId: input.spaceId,
      userId: input.id,
      role: input.spaceRole
    });
  }

  seedProject(input: {
    readonly id: string;
    readonly spaceId: string;
    readonly name: string;
    readonly createdByUserId: string;
    readonly members?: readonly { readonly userId: string; readonly role: ProjectRole }[];
  }): ProjectRecord {
    const project: ProjectRecord = {
      id: input.id,
      spaceId: input.spaceId,
      name: input.name,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(baseNow.getTime() + this.projects.size * 1_000),
      updatedAt: new Date(baseNow.getTime() + this.projects.size * 1_000)
    };
    this.projects.set(project.id, project);

    for (const member of input.members ?? []) {
      this.createMembership(project.id, member.userId, member.role);
    }

    return project;
  }

  private createMembership(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): ProjectMemberRecord {
    const user = this.users.get(userId);

    if (!user) {
      throw new Error("test user missing");
    }

    const membership: ProjectMemberRecord = {
      id: `project-member-${this.projectMembers.size + 1}`,
      projectId,
      userId,
      role,
      createdAt: new Date(baseNow.getTime() + this.projectMembers.size * 1_000),
      member: {
        id: user.id,
        email: user.email,
        displayName: user.displayName
      }
    };
    this.projectMembers.set(this.projectMemberKey(projectId, userId), membership);
    return membership;
  }

  private spaceMemberKey(spaceId: string, userId: string): string {
    return `${spaceId}:${userId}`;
  }

  private projectMemberKey(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }
}

function actor(userId: string, spaceRole: SpaceRole = "SpaceMember", spaceId = "space-1"): ProjectActor {
  return { userId, spaceId, spaceRole };
}

function expectProjectError(error: unknown, statusCode: number): void {
  expect(error).toBeInstanceOf(ProjectError);
  expect((error as ProjectError).statusCode).toBe(statusCode);
}

async function expectRejectedWithStatus(promise: Promise<unknown>, statusCode: number): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    expectProjectError(error, statusCode);
    return true;
  });
}

function expectMetadataOnly(event: AuditEventRecord): void {
  const serialized = JSON.stringify(event.metadata);

  expect(serialized).not.toMatch(
    /content|prompt|response|apiKey|signedUrl|authorization|cookie|session|token|password|storage/i
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
    passwordHash: "not-used-in-project-routes",
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

describe("project service", () => {
  let repository: InMemoryProjectRepository;
  let service: ProjectService;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    service = createProjectService(repository);

    repository.seedUser({
      id: "owner-user",
      email: "owner@example.test",
      displayName: "Owner User",
      spaceId: "space-1",
      spaceRole: "SpaceMember"
    });
    repository.seedUser({
      id: "editor-user",
      email: "editor@example.test",
      displayName: "Editor User",
      spaceId: "space-1",
      spaceRole: "SpaceMember"
    });
    repository.seedUser({
      id: "viewer-user",
      email: "viewer@example.test",
      displayName: "Viewer User",
      spaceId: "space-1",
      spaceRole: "SpaceMember"
    });
    repository.seedUser({
      id: "target-user",
      email: "target@example.test",
      displayName: "Target User",
      spaceId: "space-1",
      spaceRole: "SpaceMember"
    });
    repository.seedUser({
      id: "admin-user",
      email: "admin@example.test",
      displayName: "Admin User",
      spaceId: "space-1",
      spaceRole: "SpaceAdmin"
    });
    repository.seedUser({
      id: "outsider-user",
      email: "outsider@example.test",
      displayName: "Outsider User",
      spaceId: "space-2",
      spaceRole: "SpaceMember"
    });
  });

  it("lets a regular SpaceMember create a private project and become ProjectOwner", async () => {
    const response = await service.createProject({
      actor: actor("owner-user"),
      name: "  Genome Mapping  "
    });

    expect(response.project).toMatchObject({
      id: "project-1",
      spaceId: "space-1",
      name: "Genome Mapping",
      createdByUserId: "owner-user"
    });
    expect(response.membership).toMatchObject({
      projectId: "project-1",
      userId: "owner-user",
      role: "ProjectOwner",
      member: { email: "owner@example.test" }
    });
    expect(await repository.findProjectMembership({ projectId: "project-1", userId: "owner-user" })).toMatchObject(
      { role: "ProjectOwner" }
    );
    expect(repository.auditEvents).toHaveLength(1);
    const auditEvent = expectAuditEvent(repository.auditEvents[0]);
    expect(auditEvent).toMatchObject({
      action: "project.created",
      targetType: "Project",
      targetId: "project-1",
      metadata: {
        projectId: "project-1",
        spaceId: "space-1",
        createdByUserId: "owner-user",
        name: "Genome Mapping"
      }
    });
    expectMetadataOnly(auditEvent);
  });

  it("keeps project lists details and member lists visible only to explicit ProjectMembers", async () => {
    const privateProject = repository.seedProject({
      id: "private-project",
      spaceId: "space-1",
      name: "Private Project",
      createdByUserId: "owner-user",
      members: [
        { userId: "owner-user", role: "ProjectOwner" },
        { userId: "viewer-user", role: "ProjectViewer" }
      ]
    });
    repository.seedProject({
      id: "viewer-only-project",
      spaceId: "space-1",
      name: "Viewer Project",
      createdByUserId: "viewer-user",
      members: [{ userId: "viewer-user", role: "ProjectOwner" }]
    });

    await expect(service.getProject(actor("owner-user"), privateProject.id)).resolves.toMatchObject({
      project: { id: privateProject.id, name: "Private Project" }
    });
    await expect(service.listMembers(actor("viewer-user"), privateProject.id)).resolves.toMatchObject({
      projectId: privateProject.id,
      members: [
        { userId: "owner-user", role: "ProjectOwner" },
        { userId: "viewer-user", role: "ProjectViewer" }
      ]
    });
    await expect(service.listProjects(actor("owner-user"))).resolves.toMatchObject({
      projects: [{ id: privateProject.id }]
    });
    await expect(service.listProjects(actor("admin-user", "SpaceAdmin"))).resolves.toEqual({
      projects: []
    });
    await expectRejectedWithStatus(service.getProject(actor("target-user"), privateProject.id), 403);
    await expectRejectedWithStatus(service.listMembers(actor("admin-user", "SpaceAdmin"), privateProject.id), 403);
    await expectRejectedWithStatus(service.getProject(actor("outsider-user", "SpaceMember", "space-2"), privateProject.id), 404);
  });

  it("lets ProjectOwner add update and remove project members with metadata-only audit events", async () => {
    const project = repository.seedProject({
      id: "managed-project",
      spaceId: "space-1",
      name: "Managed Project",
      createdByUserId: "owner-user",
      members: [{ userId: "owner-user", role: "ProjectOwner" }]
    });

    const addResponse = await service.addMember({
      actor: actor("owner-user"),
      projectId: project.id,
      userId: "target-user",
      role: "ProjectViewer"
    });
    expect(addResponse.membership).toMatchObject({ userId: "target-user", role: "ProjectViewer" });

    const updateResponse = await service.updateMember({
      actor: actor("owner-user"),
      projectId: project.id,
      userId: "target-user",
      role: "ProjectEditor"
    });
    expect(updateResponse.membership).toMatchObject({ userId: "target-user", role: "ProjectEditor" });

    const removeResponse = await service.removeMember({
      actor: actor("owner-user"),
      projectId: project.id,
      userId: "target-user"
    });

    expect(removeResponse).toEqual({ ok: true });
    await expect(repository.findProjectMembership({ projectId: project.id, userId: "target-user" })).resolves.toBe(
      null
    );
    expect(repository.auditEvents.map((event) => event.action)).toEqual([
      "project_member.added",
      "project_member.role_updated",
      "project_member.removed"
    ]);
    repository.auditEvents.forEach(expectMetadataOnly);
  });

  it("rejects ProjectEditor and ProjectViewer member-management attempts", async () => {
    const project = repository.seedProject({
      id: "role-project",
      spaceId: "space-1",
      name: "Role Project",
      createdByUserId: "owner-user",
      members: [
        { userId: "owner-user", role: "ProjectOwner" },
        { userId: "editor-user", role: "ProjectEditor" },
        { userId: "viewer-user", role: "ProjectViewer" }
      ]
    });

    await expectRejectedWithStatus(
      service.addMember({
        actor: actor("editor-user"),
        projectId: project.id,
        userId: "target-user",
        role: "ProjectViewer"
      }),
      403
    );
    await expectRejectedWithStatus(
      service.updateMember({
        actor: actor("viewer-user"),
        projectId: project.id,
        userId: "editor-user",
        role: "ProjectViewer"
      }),
      403
    );
    await expectRejectedWithStatus(
      service.removeMember({
        actor: actor("editor-user"),
        projectId: project.id,
        userId: "viewer-user"
      }),
      403
    );
    expect(repository.auditEvents).toHaveLength(0);
  });

  it("does not give SpaceAdmin a project-detail or member-management bypass", async () => {
    const project = repository.seedProject({
      id: "admin-project",
      spaceId: "space-1",
      name: "Admin Project",
      createdByUserId: "owner-user",
      members: [{ userId: "owner-user", role: "ProjectOwner" }]
    });

    await expectRejectedWithStatus(service.getProject(actor("admin-user", "SpaceAdmin"), project.id), 403);
    await expectRejectedWithStatus(
      service.addMember({
        actor: actor("admin-user", "SpaceAdmin"),
        projectId: project.id,
        userId: "target-user",
        role: "ProjectViewer"
      }),
      403
    );

    repository.seedProject({
      id: "admin-owned-project",
      spaceId: "space-1",
      name: "Admin Owned Project",
      createdByUserId: "admin-user",
      members: [{ userId: "admin-user", role: "ProjectOwner" }]
    });

    await expect(
      service.addMember({
        actor: actor("admin-user", "SpaceAdmin"),
        projectId: "admin-owned-project",
        userId: "target-user",
        role: "ProjectViewer"
      })
    ).resolves.toMatchObject({ membership: { userId: "target-user", role: "ProjectViewer" } });
  });

  it("fails closed for missing projects users cross-space users duplicate members and invalid roles", async () => {
    const project = repository.seedProject({
      id: "closed-project",
      spaceId: "space-1",
      name: "Closed Project",
      createdByUserId: "owner-user",
      members: [{ userId: "owner-user", role: "ProjectOwner" }]
    });

    await expectRejectedWithStatus(service.getProject(actor("owner-user"), "missing-project"), 404);
    await expectRejectedWithStatus(
      service.addMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "missing-user",
        role: "ProjectViewer"
      }),
      404
    );
    await expectRejectedWithStatus(
      service.addMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "outsider-user",
        role: "ProjectViewer"
      }),
      404
    );
    await service.addMember({
      actor: actor("owner-user"),
      projectId: project.id,
      userId: "target-user",
      role: "ProjectViewer"
    });
    await expectRejectedWithStatus(
      service.addMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "target-user",
        role: "ProjectViewer"
      }),
      409
    );
    await expectRejectedWithStatus(
      service.addMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "editor-user",
        role: "ProjectOwner"
      }),
      400
    );
    await expectRejectedWithStatus(
      service.updateMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "editor-user",
        role: "ProjectViewer"
      }),
      404
    );
    await expectRejectedWithStatus(
      service.removeMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "editor-user"
      }),
      404
    );
    await expectRejectedWithStatus(
      service.updateMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "target-user",
        role: "InvalidRole" as ProjectRole
      }),
      400
    );
  });

  it("guards last-owner demotion and removal while allowing owner continuity", async () => {
    const project = repository.seedProject({
      id: "owner-continuity-project",
      spaceId: "space-1",
      name: "Owner Continuity Project",
      createdByUserId: "owner-user",
      members: [{ userId: "owner-user", role: "ProjectOwner" }]
    });

    await expectRejectedWithStatus(
      service.updateMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "owner-user",
        role: "ProjectViewer"
      }),
      409
    );
    await expectRejectedWithStatus(
      service.removeMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "owner-user"
      }),
      409
    );

    await service.addMember({
      actor: actor("owner-user"),
      projectId: project.id,
      userId: "target-user",
      role: "ProjectViewer"
    });
    await service.updateMember({
      actor: actor("owner-user"),
      projectId: project.id,
      userId: "target-user",
      role: "ProjectOwner"
    });

    await expect(
      service.removeMember({
        actor: actor("owner-user"),
        projectId: project.id,
        userId: "owner-user"
      })
    ).resolves.toEqual({ ok: true });
    await expect(
      repository.findProjectMembership({ projectId: project.id, userId: "target-user" })
    ).resolves.toMatchObject({ role: "ProjectOwner" });
  });
});

describe("project routes", () => {
  let app: FastifyInstance | undefined;
  let repository: InMemoryProjectRepository;
  let service: ProjectService;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    service = createProjectService(repository);
    repository.seedUser({
      id: "route-user",
      email: "route@example.test",
      displayName: "Route User",
      spaceId: "space-1",
      spaceRole: "SpaceMember"
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("registers project routes without breaking health and requires authentication", async () => {
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
      projects: {
        nodeEnv: "production",
        sessionCookieName: cookieName,
        authService: createRouteAuthService(sessions),
        projectService: service
      }
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });

    const unauthenticatedResponse = await app.inject({ method: "GET", url: "/projects" });
    expect(unauthenticatedResponse.statusCode).toBe(401);

    const createResponse = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { cookie: `${cookieName}=route-session` },
      payload: { name: "Route Project", spaceId: "space-1" }
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      project: { id: "project-1", name: "Route Project", spaceId: "space-1" },
      membership: { userId: "route-user", role: "ProjectOwner" }
    });

    const crossSpaceCreateResponse = await app.inject({
      method: "POST",
      url: "/projects",
      headers: { cookie: `${cookieName}=route-session` },
      payload: { name: "Wrong Space", spaceId: "space-2" }
    });
    expect(crossSpaceCreateResponse.statusCode).toBe(404);
  });
});
