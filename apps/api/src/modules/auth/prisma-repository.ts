import type { PrismaClient } from "@jixia/db/client";
import type { ProjectRole, SpaceRole } from "@jixia/shared";

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

const userInclude = {
  spaceMembers: {
    include: { space: true },
    orderBy: { createdAt: "asc" as const }
  },
  projectMembers: {
    include: { project: true },
    orderBy: { createdAt: "asc" as const }
  }
};

const sessionInclude = {
  user: {
    include: userInclude
  }
};

type PrismaUserWithMemberships = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly spaceMembers: readonly {
    readonly id: string;
    readonly role: string;
    readonly createdAt: Date;
    readonly space: {
      readonly id: string;
      readonly name: string;
    };
  }[];
  readonly projectMembers: readonly {
    readonly id: string;
    readonly role: string;
    readonly createdAt: Date;
    readonly project: {
      readonly id: string;
      readonly name: string;
    };
  }[];
};

type PrismaSessionWithUser = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly user: PrismaUserWithMemberships;
};

type PrismaInvitation = {
  readonly id: string;
  readonly spaceId: string;
  readonly email: string;
  readonly role: string;
  readonly tokenHash: string;
  readonly invitedByUserId: string;
  readonly acceptedByUserId: string | null;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
};

function toSpaceRole(role: string): SpaceRole {
  return role as SpaceRole;
}

function toProjectRole(role: string): ProjectRole {
  return role as ProjectRole;
}

function toAuthUser(user: PrismaUserWithMemberships): AuthUserRecord {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    passwordHash: user.passwordHash,
    spaceMembers: user.spaceMembers.map((membership) => ({
      id: membership.id,
      role: toSpaceRole(membership.role),
      createdAt: membership.createdAt,
      space: {
        id: membership.space.id,
        name: membership.space.name
      }
    })),
    projectMembers: user.projectMembers.map((membership) => ({
      id: membership.id,
      role: toProjectRole(membership.role),
      createdAt: membership.createdAt,
      project: {
        id: membership.project.id,
        name: membership.project.name
      }
    }))
  };
}

function toAuthSession(session: PrismaSessionWithUser): AuthSessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    user: toAuthUser(session.user)
  };
}

function toAuthInvitation(invitation: PrismaInvitation): AuthInvitationRecord {
  return {
    id: invitation.id,
    spaceId: invitation.spaceId,
    email: invitation.email,
    role: toSpaceRole(invitation.role),
    tokenHash: invitation.tokenHash,
    invitedByUserId: invitation.invitedByUserId,
    acceptedByUserId: invitation.acceptedByUserId,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    createdAt: invitation.createdAt
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: userInclude
    });

    return user ? toAuthUser(user) : null;
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const session = await this.prisma.session.create({
      data: input,
      include: sessionInclude
    });

    return toAuthSession(session);
  }

  async findSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: sessionInclude
    });

    return session ? toAuthSession(session) : null;
  }

  async renewSession(sessionId: string, expiresAt: Date): Promise<AuthSessionRecord | null> {
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: { expiresAt },
      include: sessionInclude
    });

    return toAuthSession(session);
  }

  async revokeSession(sessionId: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt }
    });
  }

  async revokeActiveSessionsForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: revokedAt }
      },
      data: { revokedAt }
    });
  }

  async createInvitation(input: CreateInvitationInput): Promise<AuthInvitationRecord> {
    const invitation = await this.prisma.invitation.create({ data: input });

    return toAuthInvitation(invitation);
  }

  async acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.invitation.findUnique({
        where: { tokenHash: input.tokenHash }
      });

      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.expiresAt <= input.now ||
        invitation.email !== input.email
      ) {
        return { status: "invalid" };
      }

      const existingUser = await transaction.user.findUnique({ where: { email: input.email } });

      if (existingUser) {
        return { status: "user-exists" };
      }

      const user = await transaction.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          passwordHash: input.passwordHash
        }
      });

      await transaction.spaceMember.create({
        data: {
          spaceId: invitation.spaceId,
          userId: user.id,
          role: invitation.role
        }
      });

      await transaction.invitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: input.now,
          acceptedByUserId: user.id
        }
      });

      const session = await transaction.session.create({
        data: {
          id: input.sessionId,
          userId: user.id,
          expiresAt: input.sessionExpiresAt
        },
        include: sessionInclude
      });

      return {
        status: "accepted",
        session: toAuthSession(session)
      };
    });
  }
}
