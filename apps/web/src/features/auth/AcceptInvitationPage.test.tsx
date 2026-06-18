import type { AcceptInvitationResponse } from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptInvitationPage } from "./AcceptInvitationPage";

describe("AcceptInvitationPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("prefills and scrubs the URL token, then accepts the invitation with cookie credentials", async () => {
    window.history.replaceState(null, "", "/accept-invitation?token=invite-token-1234567890");
    const acceptResponse: AcceptInvitationResponse = {
      currentSession: {
        user: {
          id: "user-2",
          email: "new-user@example.test",
          displayName: "New User",
          space: { id: "space-1", name: "Jixia Lab", role: "SpaceMember" },
          projectMemberships: []
        },
        expiresAt: "2026-06-22T12:00:00.000Z"
      }
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(acceptResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onAccepted = vi.fn();

    render(<AcceptInvitationPage onAccepted={onAccepted} />);

    const tokenInput = screen.getByLabelText(/invitation token/i) as HTMLInputElement;
    expect(tokenInput.value).toBe("invite-token-1234567890");

    await waitFor(() => expect(window.location.search).toBe(""));

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "new-user@example.test" }
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "New User" }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct horse battery staple" }
    });
    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    expect(
      (screen.getByRole("button", { name: /creating account/i }) as HTMLButtonElement).disabled
    ).toBe(true);

    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(acceptResponse));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invitations/accept",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          invitationToken: "invite-token-1234567890",
          email: "new-user@example.test",
          displayName: "New User",
          password: "correct horse battery staple"
        })
      })
    );
  });

  it("shows the server error message when invitation acceptance fails", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invitation is invalid or expired" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AcceptInvitationPage />);

    fireEvent.change(screen.getByLabelText(/invitation token/i), {
      target: { value: "expired-token-1234567890" }
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "new-user@example.test" }
    });
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: "New User" }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct horse battery staple" }
    });
    fireEvent.click(screen.getByRole("button", { name: /accept invitation/i }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Invitation is invalid or expired"
    );
  });
});
