import type {
  AcceptInvitationRequest,
  CurrentSessionView,
  CreateInvitationRequest,
  InvitationDTO,
  LoginRequest,
  SpaceRole
} from "@jixia/shared";

import { conflict, forbidden, invalidInvitation, unauthorized } from "./errors.js";
import { generateOpaqueToken, hashInvitationToken, normalizeEmail } from "./tokens.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import type {
  AuthInvitationRecord,
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord
} from "./repository.js";

const dayInMilliseconds = 24 * 60 * 60 * 1000;

export const sessionDurationMilliseconds = 7 * dayInMilliseconds;
export const sessionRenewalThresholdMilliseconds = 2 * dayInMilliseconds;
export const invitationDurationMilliseconds = 7 * dayInMilliseconds;

export type AuthServiceOptions = {
  readonly now?: () => Date;
};

export type CurrentSessionResult = {
  readonly session: AuthSessionRecord;
  readonly currentSession: CurrentSessionView;
  readonly renewed: boolean;
};

export type LoginResult = {
  readonly session: AuthSessionRecord;
  readonly currentSession: CurrentSessionView;
};

export type CreateInvitationResult = {
  readonly invitation: InvitationDTO;
};

export type AuthService = ReturnType<typeof createAuthService>;

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function toInvitationDTO(invitation: AuthInvitationRecord): InvitationDTO {
  return {
    id: invitation.id,
    spaceId: invitation.spaceId,
    email: invitation.email,
    role: invitation.role,
    invitedByUserId: invitation.invitedByUserId,
    acceptedByUserId: invitation.acceptedByUserId,
    expiresAt: toIsoString(invitation.expiresAt),
    acceptedAt: invitation.acceptedAt ? toIsoString(invitation.acceptedAt) : null,
    createdAt: toIsoString(invitation.createdAt)
  };
}

function toCurrentSessionView(session: AuthSessionRecord): CurrentSessionView {
  const spaceMember = session.user.spaceMembers[0];

  if (!spaceMember) {
    throw unauthorized();
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      space: {
        id: spaceMember.space.id,
        name: spaceMember.space.name,
        role: spaceMember.role
      },
      projectMemberships: session.user.projectMembers.map((membership) => ({
        projectId: membership.project.id,
        projectName: membership.project.name,
        role: membership.role
      }))
    },
    expiresAt: toIsoString(session.expiresAt)
  };
}

function ensureActiveSession(session: AuthSessionRecord | null, now: Date): AuthSessionRecord {
  if (!session || session.revokedAt || session.expiresAt <= now) {
    throw unauthorized();
  }

  return session;
}

function ensureSpaceAdmin(session: AuthSessionRecord): { readonly spaceId: string } {
  const spaceMember = session.user.spaceMembers[0];

  if (!spaceMember || spaceMember.role !== "SpaceAdmin") {
    throw forbidden("SpaceAdmin role required");
  }

  return { spaceId: spaceMember.space.id };
}

function currentSpaceRole(user: AuthUserRecord): SpaceRole | undefined {
  return user.spaceMembers[0]?.role;
}

export function createAuthService(repository: AuthRepository, options: AuthServiceOptions = {}) {
  const getNow = options.now ?? (() => new Date());

  async function createSessionForUser(userId: string): Promise<AuthSessionRecord> {
    const now = getNow();
    return repository.createSession({
      id: generateOpaqueToken(),
      userId,
      expiresAt: addMilliseconds(now, sessionDurationMilliseconds)
    });
  }

  return {
    async login(request: LoginRequest): Promise<LoginResult> {
      const user = await repository.findUserByEmail(normalizeEmail(request.email));

      if (!user || !(await verifyPassword(user.passwordHash, request.password))) {
        throw unauthorized("Invalid email or password");
      }

      if (!currentSpaceRole(user)) {
        throw unauthorized();
      }

      const session = await createSessionForUser(user.id);

      return {
        session,
        currentSession: toCurrentSessionView(session)
      };
    },

    async getCurrentSession(sessionId: string, renew: boolean): Promise<CurrentSessionResult> {
      const now = getNow();
      const session = ensureActiveSession(await repository.findSessionById(sessionId), now);
      const remainingLifetime = session.expiresAt.getTime() - now.getTime();

      if (renew && remainingLifetime < sessionRenewalThresholdMilliseconds) {
        const renewedSession = ensureActiveSession(
          await repository.renewSession(session.id, addMilliseconds(now, sessionDurationMilliseconds)),
          now
        );

        return {
          session: renewedSession,
          currentSession: toCurrentSessionView(renewedSession),
          renewed: true
        };
      }

      return {
        session,
        currentSession: toCurrentSessionView(session),
        renewed: false
      };
    },

    async logout(sessionId: string): Promise<void> {
      const now = getNow();
      ensureActiveSession(await repository.findSessionById(sessionId), now);
      await repository.revokeSession(sessionId, now);
    },

    async logoutAll(sessionId: string): Promise<void> {
      const now = getNow();
      const session = ensureActiveSession(await repository.findSessionById(sessionId), now);
      await repository.revokeActiveSessionsForUser(session.userId, now);
    },

    async createInvitation(
      session: AuthSessionRecord,
      request: CreateInvitationRequest
    ): Promise<CreateInvitationResult> {
      const { spaceId } = ensureSpaceAdmin(session);
      const now = getNow();
      const invitation = await repository.createInvitation({
        spaceId,
        email: normalizeEmail(request.email),
        role: request.role,
        tokenHash: hashInvitationToken(generateOpaqueToken()),
        invitedByUserId: session.userId,
        expiresAt: addMilliseconds(now, invitationDurationMilliseconds)
      });

      return {
        invitation: toInvitationDTO(invitation)
      };
    },

    async acceptInvitation(request: AcceptInvitationRequest): Promise<LoginResult> {
      const now = getNow();
      const result = await repository.acceptInvitation({
        tokenHash: hashInvitationToken(request.invitationToken),
        email: normalizeEmail(request.email),
        displayName: request.displayName.trim(),
        passwordHash: await hashPassword(request.password),
        now,
        sessionId: generateOpaqueToken(),
        sessionExpiresAt: addMilliseconds(now, sessionDurationMilliseconds)
      });

      switch (result.status) {
        case "accepted":
          return {
            session: result.session,
            currentSession: toCurrentSessionView(result.session)
          };
        case "invalid":
          throw invalidInvitation();
        case "user-exists":
          throw conflict("User already exists");
      }
    }
  };
}
