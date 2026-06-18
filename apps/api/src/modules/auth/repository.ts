import type { ProjectRole, SpaceRole } from "@jixia/shared";

export type AuthSpaceMembership = {
  readonly id: string;
  readonly role: SpaceRole;
  readonly createdAt: Date;
  readonly space: {
    readonly id: string;
    readonly name: string;
  };
};

export type AuthProjectMembership = {
  readonly id: string;
  readonly role: ProjectRole;
  readonly createdAt: Date;
  readonly project: {
    readonly id: string;
    readonly name: string;
  };
};

export type AuthUserRecord = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly spaceMembers: readonly AuthSpaceMembership[];
  readonly projectMembers: readonly AuthProjectMembership[];
};

export type AuthSessionRecord = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly user: AuthUserRecord;
};

export type AuthInvitationRecord = {
  readonly id: string;
  readonly spaceId: string;
  readonly email: string;
  readonly role: SpaceRole;
  readonly tokenHash: string;
  readonly invitedByUserId: string;
  readonly acceptedByUserId: string | null;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;
  readonly createdAt: Date;
};

export type CreateSessionInput = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
};

export type CreateInvitationInput = {
  readonly spaceId: string;
  readonly email: string;
  readonly role: SpaceRole;
  readonly tokenHash: string;
  readonly invitedByUserId: string;
  readonly expiresAt: Date;
};

export type AcceptInvitationInput = {
  readonly tokenHash: string;
  readonly email: string;
  readonly displayName: string;
  readonly passwordHash: string;
  readonly now: Date;
  readonly sessionId: string;
  readonly sessionExpiresAt: Date;
};

export type AcceptInvitationResult =
  | {
      readonly status: "accepted";
      readonly session: AuthSessionRecord;
    }
  | {
      readonly status: "invalid" | "user-exists";
    };

export type AuthRepository = {
  readonly findUserByEmail: (email: string) => Promise<AuthUserRecord | null>;
  readonly createSession: (input: CreateSessionInput) => Promise<AuthSessionRecord>;
  readonly findSessionById: (sessionId: string) => Promise<AuthSessionRecord | null>;
  readonly renewSession: (sessionId: string, expiresAt: Date) => Promise<AuthSessionRecord | null>;
  readonly revokeSession: (sessionId: string, revokedAt: Date) => Promise<void>;
  readonly revokeActiveSessionsForUser: (userId: string, revokedAt: Date) => Promise<void>;
  readonly createInvitation: (input: CreateInvitationInput) => Promise<AuthInvitationRecord>;
  readonly acceptInvitation: (input: AcceptInvitationInput) => Promise<AcceptInvitationResult>;
};
