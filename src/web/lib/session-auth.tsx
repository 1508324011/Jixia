import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { LoginSessionRequest, SessionUser } from "@shared/contracts/session";

import { ApiError, requestJson } from "./http-client";

interface SessionAuthContextValue {
  error: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(input: LoginSessionRequest): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
  user: SessionUser | null;
}

const SessionAuthContext = createContext<SessionAuthContextValue | null>(null);

async function loadCurrentSession(): Promise<SessionUser | null> {
  try {
    const response = await requestJson<{ user: SessionUser }>("/api/session/me", {
      credentials: "same-origin",
    });
    return response.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export function SessionAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setUser(await loadCurrentSession());
    } catch (sessionError) {
      setUser(null);
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Failed to load session.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (input: LoginSessionRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await requestJson<{ user: SessionUser }>("/api/session/login", {
        body: JSON.stringify(input),
        credentials: "same-origin",
        method: "POST",
      });
      setUser(response.user);
    } catch (sessionError) {
      setUser(null);
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Login failed.",
      );
      throw sessionError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await requestJson<{ ok: true }>("/api/session/logout", {
        credentials: "same-origin",
        method: "POST",
      });
      setUser(null);
    } catch (sessionError) {
      setError(
        sessionError instanceof Error
          ? sessionError.message
          : "Logout failed.",
      );
      throw sessionError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const value = useMemo<SessionAuthContextValue>(
    () => ({
      error,
      isAuthenticated: Boolean(user),
      isLoading,
      login,
      logout,
      refresh,
      user,
    }),
    [error, isLoading, login, logout, refresh, user],
  );

  return (
    <SessionAuthContext.Provider value={value}>
      {children}
    </SessionAuthContext.Provider>
  );
}

export function useSessionAuth(): SessionAuthContextValue {
  const context = useContext(SessionAuthContext);

  if (!context) {
    throw new Error("useSessionAuth must be used inside SessionAuthProvider.");
  }

  return context;
}
