import type { ProjectRole, SpaceRole } from "@jixia/shared";

import type { AuthInvitationRecord, AuthSessionRecord, AuthUserRecord } from "./repository.js";

export type PrismaUserWithMemberships = {
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

export type PrismaSessionWithUser = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly user: PrismaUserWithMemberships;
};

export type PrismaInvitation = {
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

export function toAuthUser(user: PrismaUserWithMemberships): AuthUserRecord {
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

export function toAuthSession(session: PrismaSessionWithUser): AuthSessionRecord {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    user: toAuthUser(session.user)
  };
}

export function toAuthInvitation(invitation: PrismaInvitation): AuthInvitationRecord {
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
