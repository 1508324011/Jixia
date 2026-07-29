import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestApiApp } from "../../test-utils/app.js";
import { hashPassword } from "./passwords.js";
import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
  AuthInvitationRecord,
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  CreateInvitationInput,
  CreateSessionInput
} from "./repository.js";
import {
  createAuthService,
  sessionDurationMilliseconds,
  sessionRenewalThresholdMilliseconds
} from "./service.js";
import { generateOpaqueToken, hashInvitationToken } from "./tokens.js";

const cookieName = "jixia_test_session";
const space = { id: "space-1", name: "Jixia Lab" };
const baseNow = new Date("2026-06-14T12:00:00.000Z");

type InvitationAuditEvent = {
  readonly actorUserId: string;
  readonly action: string;
  readonly targetType: "Invitation";
  readonly targetId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
};

class InMemoryAuthRepository implements AuthRepository {
  readonly users = new Map<string, AuthUserRecord>();
  readonly sessions = new Map<string, AuthSessionRecord>();
  readonly invitations = new Map<string, AuthInvitationRecord>();
  readonly auditEvents: InvitationAuditEvent[] = [];

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.users.get(email) ?? null;
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const user = this.usersById().get(input.userId);

    if (!user) {
      throw new Error("test user missing");
    }

    const session: AuthSessionRecord = {
      id: input.id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      user
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    const user = this.usersById().get(session.userId);

    if (!user) {
      return null;
    }

    const hydratedSession: AuthSessionRecord = { ...session, user };
    this.sessions.set(sessionId, hydratedSession);
    return hydratedSession;
  }

  async renewSession(sessionId: string, expiresAt: Date): Promise<AuthSessionRecord | null> {
    const session = await this.findSessionById(sessionId);

    if (!session) {
      return null;
    }

    const renewedSession: AuthSessionRecord = { ...session, expiresAt };
    this.sessions.set(sessionId, renewedSession);
    return renewedSession;
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    const session = await this.findSessionById(sessionId);

    if (session) {
      this.sessions.set(sessionId, { ...session, revokedAt });
    }
  }

  async revokeActiveSessionsForUser(userId: string, revokedAt: Date): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (session.userId === userId && !session.revokedAt && session.expiresAt > revokedAt) {
        this.sessions.set(sessionId, { ...session, revokedAt });
      }
    }
  }

  async createInvitation(input: CreateInvitationInput): Promise<AuthInvitationRecord> {
    const invitation: AuthInvitationRecord = {
      id: `invitation-${this.invitations.size + 1}`,
      spaceId: input.spaceId,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
      invitedByUserId: input.invitedByUserId,
      acceptedByUserId: null,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      createdAt: baseNow
    };
    this.invitations.set(invitation.tokenHash, invitation);
    this.auditEvents.push({
      actorUserId: input.invitedByUserId,
      action: "invitation.created",
      targetType: "Invitation",
      targetId: invitation.id,
      metadata: {
        invitationId: invitation.id,
        spaceId: invitation.spaceId,
        role: invitation.role,
        invitedByUserId: invitation.invitedByUserId,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString()
      }
    });
    return invitation;
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    const invitation = this.invitations.get(input.tokenHash);

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= input.now ||
      invitation.email !== input.email
    ) {
      return { status: "invalid" };
    }

    if (this.users.has(input.email)) {
      return { status: "user-exists" };
    }

    const user: AuthUserRecord = {
      id: `user-${this.users.size + 1}`,
      email: input.email,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      spaceMembers: [
        {
          id: `space-member-${this.users.size + 1}`,
          role: invitation.role,
          createdAt: input.now,
          space
        }
      ],
      projectMembers: []
    };
    this.users.set(user.email, user);

    this.invitations.set(input.tokenHash, {
      ...invitation,
      acceptedAt: input.now,
      acceptedByUserId: user.id
    });

    const session = await this.createSession({
      id: input.sessionId,
      userId: user.id,
      expiresAt: input.sessionExpiresAt
    });
    this.auditEvents.push({
      actorUserId: user.id,
      action: "invitation.accepted",
      targetType: "Invitation",
      targetId: invitation.id,
      metadata: {
        invitationId: invitation.id,
        spaceId: invitation.spaceId,
        role: invitation.role,
        acceptedByUserId: user.id,
        acceptedAt: input.now.toISOString()
      }
    });

    return { status: "accepted", session };
  }

  async seedUser(input: {
    readonly id: string;
    readonly email: string;
    readonly displayName: string;
    readonly password: string;
    readonly role: "SpaceAdmin" | "SpaceMember";
  }): Promise<void> {
    this.users.set(input.email, {
      id: input.id,
      email: input.email,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      spaceMembers: [
        {
          id: `${input.id}-space-member`,
          role: input.role,
          createdAt: baseNow,
          space
        }
      ],
      projectMembers: []
    });
  }

  seedInvitation(input: {
    readonly invitationToken: string;
    readonly email: string;
    readonly expiresAt: Date;
    readonly acceptedAt?: Date | null;
  }): void {
    const tokenHash = hashInvitationToken(input.invitationToken);
    this.invitations.set(tokenHash, {
      id: `seeded-${this.invitations.size + 1}`,
      spaceId: space.id,
      email: input.email,
      role: "SpaceMember",
      tokenHash,
      invitedByUserId: "admin-user",
      acceptedByUserId: input.acceptedAt ? "existing-user" : null,
      expiresAt: input.expiresAt,
      acceptedAt: input.acceptedAt ?? null,
      createdAt: baseNow
    });
  }

  private usersById(): Map<string, AuthUserRecord> {
    return new Map(Array.from(this.users.values(), (user) => [user.id, user]));
  }
}

function getSetCookie(response: {
  readonly headers: Record<string, number | string | string[] | undefined>;
}): string {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return header[0] ?? "";
  }

  return typeof header === "string" ? header : "";
}

function sessionCookieFrom(response: {
  readonly headers: Record<string, number | string | string[] | undefined>;
}): {
  readonly header: string;
  readonly id: string;
  readonly cookie: string;
} {
  const header = getSetCookie(response);
  const cookie = header.split(";")[0] ?? "";
  const id = cookie.slice(`${cookieName}=`.length);

  return { header, id, cookie };
}

function createTestSecret(label: string): string {
  return `${label}-${generateOpaqueToken(18)}`;
}

describe("auth and invitation routes", () => {
  let app: FastifyInstance | undefined;
  let repository: InMemoryAuthRepository;
  let now: Date;
  let adminLoginSecret: string;
  let memberLoginSecret: string;

  beforeEach(async () => {
    now = new Date(baseNow);
    adminLoginSecret = createTestSecret("admin-login");
    memberLoginSecret = createTestSecret("member-login");
    repository = new InMemoryAuthRepository();
    await repository.seedUser({
      id: "admin-user",
      email: "admin@example.test",
      displayName: "Admin User",
      password: adminLoginSecret,
      role: "SpaceAdmin"
    });
    await repository.seedUser({
      id: "member-user",
      email: "member@example.test",
      displayName: "Member User",
      password: memberLoginSecret,
      role: "SpaceMember"
    });

    app = await createTestApiApp({
      auth: {
        nodeEnv: "production",
        sessionCookieName: cookieName,
        service: createAuthService(repository, { now: () => now })
      }
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function login(email = "admin@example.test", password = adminLoginSecret) {
    if (!app) {
      throw new Error("test app missing");
    }

    return app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password }
    });
  }

  it("logs in with a secure opaque server-side session cookie", async () => {
    const response = await login();
    const { header, id } = sessionCookieFrom(response);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currentSession: {
        user: {
          email: "admin@example.test",
          space: { id: space.id, role: "SpaceAdmin" }
        }
      }
    });
    expect(repository.sessions.get(id)?.userId).toBe("admin-user");
    expect(repository.sessions.get(id)?.expiresAt).toEqual(
      new Date(baseNow.getTime() + sessionDurationMilliseconds)
    );
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(JSON.stringify(response.json())).not.toContain(id);
    expect(JSON.stringify(response.json())).not.toContain(adminLoginSecret);
  });

  it("rejects invalid login credentials", async () => {
    const response = await login("admin@example.test", createTestSecret("invalid-login"));

    expect(response.statusCode).toBe(401);
    expect(repository.sessions.size).toBe(0);
  });

  it("returns auth/me and only renews sliding expiry below the two-day threshold", async () => {
    const loginResponse = await login();
    const { cookie, id } = sessionCookieFrom(loginResponse);
    const originalExpiresAt = repository.sessions.get(id)?.expiresAt;

    if (!app || !originalExpiresAt) {
      throw new Error("test session missing");
    }

    const earlyResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie }
    });

    expect(earlyResponse.statusCode).toBe(200);
    expect(getSetCookie(earlyResponse)).toBe("");
    expect(repository.sessions.get(id)?.expiresAt).toEqual(originalExpiresAt);

    now = new Date(originalExpiresAt.getTime() - sessionRenewalThresholdMilliseconds + 1_000);

    const renewalResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie }
    });

    expect(renewalResponse.statusCode).toBe(200);
    expect(getSetCookie(renewalResponse)).toContain(`${cookieName}=${id}`);
    expect(repository.sessions.get(id)?.expiresAt.getTime()).toBeGreaterThan(
      originalExpiresAt.getTime()
    );
  });

  it("logs out the current session and clears the cookie", async () => {
    const loginResponse = await login();
    const { cookie, id } = sessionCookieFrom(loginResponse);

    if (!app) {
      throw new Error("test app missing");
    }

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie }
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({ ok: true });
    expect(repository.sessions.get(id)?.revokedAt).toEqual(now);
    expect(getSetCookie(logoutResponse)).toContain(`${cookieName}=`);

    const meResponse = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(meResponse.statusCode).toBe(401);
  });

  it("logs out all active sessions for the current user", async () => {
    const firstLogin = await login();
    const secondLogin = await login();
    const firstCookie = sessionCookieFrom(firstLogin).cookie;
    const secondCookie = sessionCookieFrom(secondLogin).cookie;

    if (!app) {
      throw new Error("test app missing");
    }

    const logoutAllResponse = await app.inject({
      method: "POST",
      url: "/auth/logout-all",
      headers: { cookie: firstCookie }
    });

    expect(logoutAllResponse.statusCode).toBe(200);
    expect(getSetCookie(logoutAllResponse)).toContain(`${cookieName}=`);
    expect(Array.from(repository.sessions.values()).every((session) => session.revokedAt)).toBe(true);

    expect(
      (await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: firstCookie } }))
        .statusCode
    ).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: secondCookie } }))
        .statusCode
    ).toBe(401);
  });

  it("allows only SpaceAdmin users to create invitations without returning tokens", async () => {
    const adminLogin = await login();
    const memberLogin = await login("member@example.test", memberLoginSecret);
    const adminCookie = sessionCookieFrom(adminLogin).cookie;
    const memberCookie = sessionCookieFrom(memberLogin).cookie;

    if (!app) {
      throw new Error("test app missing");
    }

    const forbiddenResponse = await app.inject({
      method: "POST",
      url: "/invitations",
      headers: { cookie: memberCookie },
      payload: { email: "invitee@example.test", role: "SpaceMember" }
    });

    expect(forbiddenResponse.statusCode).toBe(403);

    const response = await app.inject({
      method: "POST",
      url: "/invitations",
      headers: { cookie: adminCookie },
      payload: { email: "Invitee@Example.Test", role: "SpaceMember" }
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.invitation).toMatchObject({
      email: "invitee@example.test",
      role: "SpaceMember",
      spaceId: space.id,
      invitedByUserId: "admin-user"
    });
    expect(JSON.stringify(body)).not.toMatch(/token|password|session/i);
    expect(Array.from(repository.invitations.values())[0]?.tokenHash).toBeTruthy();
    expect(repository.auditEvents).toEqual([
      expect.objectContaining({
        actorUserId: "admin-user",
        action: "invitation.created",
        targetType: "Invitation",
        metadata: expect.objectContaining({
          spaceId: space.id,
          role: "SpaceMember",
          invitedByUserId: "admin-user"
        })
      })
    ]);
    expect(JSON.stringify(repository.auditEvents)).not.toMatch(/email|token|password|session/i);
  });

  it("accepts a valid invitation, creates a user, and starts a session", async () => {
    const invitationToken = generateOpaqueToken();
    const newUserSecret = createTestSecret("new-user");
    repository.seedInvitation({
      invitationToken,
      email: "new-user@example.test",
      expiresAt: new Date(now.getTime() + 60_000)
    });

    if (!app) {
      throw new Error("test app missing");
    }

    const response = await app.inject({
      method: "POST",
      url: "/invitations/accept",
      payload: {
        invitationToken,
        email: "new-user@example.test",
        displayName: "New User",
        password: newUserSecret
      }
    });
    const { cookie, id } = sessionCookieFrom(response);
    const user = repository.users.get("new-user@example.test");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currentSession: {
        user: {
          email: "new-user@example.test",
          displayName: "New User",
          space: { role: "SpaceMember" }
        }
      }
    });
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toBe(newUserSecret);
    expect(repository.sessions.get(id)?.userId).toBe(user?.id);
    expect(JSON.stringify(response.json())).not.toContain(invitationToken);
    expect(repository.auditEvents).toEqual([
      expect.objectContaining({
        actorUserId: user?.id,
        action: "invitation.accepted",
        targetType: "Invitation",
        metadata: expect.objectContaining({
          spaceId: space.id,
          role: "SpaceMember",
          acceptedByUserId: user?.id,
          acceptedAt: now.toISOString()
        })
      })
    ]);
    expect(JSON.stringify(repository.auditEvents)).not.toMatch(/email|token|password|session/i);

    const meResponse = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
    expect(meResponse.statusCode).toBe(200);
  });

  it("rejects expired and already used invitations", async () => {
    const expiredInvitationToken = generateOpaqueToken();
    const usedInvitationToken = generateOpaqueToken();
    repository.seedInvitation({
      invitationToken: expiredInvitationToken,
      email: "expired@example.test",
      expiresAt: new Date(now.getTime() - 1)
    });
    repository.seedInvitation({
      invitationToken: usedInvitationToken,
      email: "used@example.test",
      expiresAt: new Date(now.getTime() + 60_000),
      acceptedAt: now
    });

    if (!app) {
      throw new Error("test app missing");
    }

    const expiredResponse = await app.inject({
      method: "POST",
      url: "/invitations/accept",
      payload: {
        invitationToken: expiredInvitationToken,
        email: "expired@example.test",
        displayName: "Expired User",
        password: createTestSecret("expired-user")
      }
    });
    const usedResponse = await app.inject({
      method: "POST",
      url: "/invitations/accept",
      payload: {
        invitationToken: usedInvitationToken,
        email: "used@example.test",
        displayName: "Used User",
        password: createTestSecret("used-user")
      }
    });

    expect(expiredResponse.statusCode).toBe(400);
    expect(usedResponse.statusCode).toBe(400);
    expect(repository.users.has("expired@example.test")).toBe(false);
    expect(repository.users.has("used@example.test")).toBe(false);
  });

  it("rejects revoked and expired sessions", async () => {
    const revokedLogin = await login();
    const expiredLogin = await login();
    const revoked = sessionCookieFrom(revokedLogin);
    const expired = sessionCookieFrom(expiredLogin);

    const revokedSession = repository.sessions.get(revoked.id);
    const expiredSession = repository.sessions.get(expired.id);

    if (!app || !revokedSession || !expiredSession) {
      throw new Error("test sessions missing");
    }

    repository.sessions.set(revoked.id, { ...revokedSession, revokedAt: now });
    repository.sessions.set(expired.id, {
      ...expiredSession,
      expiresAt: new Date(now.getTime() - 1)
    });

    const revokedResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: revoked.cookie }
    });
    const expiredResponse = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: expired.cookie }
    });

    expect(revokedResponse.statusCode).toBe(401);
    expect(expiredResponse.statusCode).toBe(401);
  });
});
