export interface SessionUser {
  displayName: string;
  email: string;
  id: string;
}

export type LoginProfileKey = "alice" | "bob" | "charlie";

export interface LoginSessionRequest {
  loginProfileKey: LoginProfileKey;
}

export interface SessionResponse {
  user: SessionUser;
}

export interface LogoutSessionResponse {
  ok: true;
}

export const sessionContract = "jixia-session-contract";
