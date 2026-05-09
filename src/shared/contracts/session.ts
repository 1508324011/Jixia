export interface SessionUser {
  displayName: string;
  email: string;
  id: string;
}

export interface LoginSessionRequest {
  email?: string;
  userId?: string;
}

export interface SessionResponse {
  user: SessionUser;
}

export interface LogoutSessionResponse {
  ok: true;
}

export const sessionContract = "jixia-session-contract";
