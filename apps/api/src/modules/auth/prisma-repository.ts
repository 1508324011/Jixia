import type { PrismaClient } from "@jixia/db/client";
import type { Prisma } from "@jixia/db/generated";
import { ensureMetadataOnlyAuditPayload } from "../audit/audit.service.js";
import {
  toAuthInvitation,
  toAuthSession,
  toAuthUser
} from "./prisma-record-mappers.js";
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
    return this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.invitation.create({ data: input });
      const auditMetadata = {
        invitationId: invitation.id,
        spaceId: invitation.spaceId,
        role: invitation.role,
        invitedByUserId: invitation.invitedByUserId,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString()
      } satisfies Record<string, unknown>;
      ensureMetadataOnlyAuditPayload(auditMetadata);
      await transaction.auditEvent.create({
        data: {
          actorUserId: invitation.invitedByUserId,
          action: "invitation.created",
          targetType: "Invitation",
          targetId: invitation.id,
          metadata: auditMetadata as Prisma.InputJsonValue
        }
      });

      return toAuthInvitation(invitation);
    });
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
      const auditMetadata = {
        invitationId: invitation.id,
        spaceId: invitation.spaceId,
        role: invitation.role,
        acceptedByUserId: user.id,
        acceptedAt: input.now.toISOString()
      } satisfies Record<string, unknown>;
      ensureMetadataOnlyAuditPayload(auditMetadata);
      await transaction.auditEvent.create({
        data: {
          actorUserId: user.id,
          action: "invitation.accepted",
          targetType: "Invitation",
          targetId: invitation.id,
          metadata: auditMetadata as Prisma.InputJsonValue
        }
      });

      return {
        status: "accepted",
        session: toAuthSession(session)
      };
    });
  }
}
