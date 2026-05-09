import type {
  LoginSessionRequest,
  LogoutSessionResponse,
  SessionUser,
} from "@shared/contracts/session";

import type {
  SessionLoginResult,
  SessionLookupContext,
  SessionService,
} from "../services/session.service";

export interface SessionRoutes {
  createLoginSession(
    input: LoginSessionRequest,
    context?: SessionLookupContext,
  ): Promise<SessionLoginResult>;
  getCurrentUserFromToken(
    sessionToken: string,
    context?: SessionLookupContext,
  ): Promise<SessionUser | null>;
  revokeSessionToken(sessionToken: string): Promise<LogoutSessionResponse>;
}

export function createSessionRoutes(service: SessionService): SessionRoutes {
  return {
    createLoginSession(
      input: LoginSessionRequest,
      context?: SessionLookupContext,
    ): Promise<SessionLoginResult> {
      return service.createLoginSession(input, context);
    },
    getCurrentUserFromToken(
      sessionToken: string,
      context?: SessionLookupContext,
    ): Promise<SessionUser | null> {
      return service.getCurrentUserFromToken(sessionToken, context);
    },
    revokeSessionToken(sessionToken: string): Promise<LogoutSessionResponse> {
      return service.revokeSessionToken(sessionToken);
    },
  };
}
