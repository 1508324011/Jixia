import type { LoginResponse } from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("posts credentials through the API client with cookie credentials", async () => {
    const loginResponse: LoginResponse = {
      currentSession: {
        user: {
          id: "user-1",
          email: "researcher@example.test",
          displayName: "Researcher",
          space: { id: "space-1", name: "Jixia Lab", role: "SpaceMember" },
          projectMemberships: []
        },
        expiresAt: "2026-06-22T12:00:00.000Z"
      }
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(loginResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onLoginSuccess = vi.fn();

    render(<LoginPage onLoginSuccess={onLoginSuccess} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "researcher@example.test" }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct horse battery staple" }
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect((screen.getByRole("button", { name: /signing in/i }) as HTMLButtonElement).disabled).toBe(
      true
    );

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalledWith(loginResponse));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "researcher@example.test",
          password: "correct horse battery staple"
        })
      })
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = init?.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("Content-Type")).toBe("application/json");
  });

  it("shows the server error message when login fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "researcher@example.test" }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "wrong password" }
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect((await screen.findByRole("alert")).textContent).toBe("Invalid credentials");
  });
});
