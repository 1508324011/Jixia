import type { AcceptInvitationRequest, AcceptInvitationResponse } from "@jixia/shared";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../lib/api";

type AcceptInvitationPageProps = {
  readonly onAccepted?: (response: AcceptInvitationResponse) => void;
};

export function AcceptInvitationPage({ onAccepted }: AcceptInvitationPageProps) {
  const tokenFromUrl = useMemo(() => invitationTokenFromUrl(window.location), []);
  const [invitationToken, setInvitationToken] = useState(tokenFromUrl);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenFromUrl) {
      return;
    }

    const scrubbedUrl = new URL(window.location.href);
    scrubbedUrl.searchParams.delete("token");
    scrubbedUrl.searchParams.delete("invitationToken");
    window.history.replaceState(window.history.state, "", scrubbedUrl);
  }, [tokenFromUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const payload: AcceptInvitationRequest = {
      invitationToken,
      email,
      displayName,
      password
    };

    try {
      const response = await apiFetch<AcceptInvitationResponse>("/invitations/accept", {
        method: "POST",
        json: payload
      });
      setStatus("success");
      onAccepted?.(response);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to accept invitation.");
    }
  }

  return (
    <main style={pageStyle}>
      <section style={panelStyle} aria-labelledby="accept-title">
        <div style={copyStyle}>
          <p style={eyebrowStyle}>Invitation</p>
          <h1 id="accept-title" style={titleStyle}>
            Join your lab workspace.
          </h1>
          <p style={bodyStyle}>
            The invitation token is used only to complete this server-side account creation flow.
            Jixia stores only the backend token hash and starts the session with an HttpOnly cookie.
          </p>
        </div>

        <form style={formStyle} onSubmit={handleSubmit}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Invitation token</span>
            <input
              autoComplete="off"
              name="invitationToken"
              onChange={(event) => setInvitationToken(event.currentTarget.value)}
              required
              style={inputStyle}
              type="text"
              value={invitationToken}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              style={inputStyle}
              type="email"
              value={email}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Display name</span>
            <input
              autoComplete="name"
              name="displayName"
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              required
              style={inputStyle}
              type="text"
              value={displayName}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Password</span>
            <input
              autoComplete="new-password"
              minLength={8}
              name="password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              style={inputStyle}
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? (
            <p role="alert" style={errorStyle}>
              {errorMessage}
            </p>
          ) : null}

          {status === "success" ? (
            <p role="status" style={successStyle}>
              Invitation accepted. Opening Jixia…
            </p>
          ) : null}

          <button disabled={status === "submitting"} style={buttonStyle} type="submit">
            {status === "submitting" ? "Creating account…" : "Accept invitation"}
          </button>
        </form>
      </section>
    </main>
  );
}

type FormStatus = "idle" | "submitting" | "success" | "error";

function invitationTokenFromUrl(location: Location): string {
  const params = new URLSearchParams(location.search);
  return params.get("token") ?? params.get("invitationToken") ?? "";
}

const pageStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "32px",
  background:
    "linear-gradient(135deg, rgba(248,245,239,1) 0%, rgba(240,247,247,1) 62%, rgba(232,238,236,1) 100%)",
  color: "#17212b",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
};

const panelStyle = {
  width: "min(100%, 960px)",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 410px)",
  gap: "28px",
  border: "1px solid #d9e2e8",
  borderRadius: "32px",
  background: "rgba(255, 255, 255, 0.78)",
  boxShadow: "0 30px 90px rgba(15, 23, 42, 0.13)",
  padding: "clamp(24px, 5vw, 48px)"
};

const copyStyle = {
  display: "grid",
  alignContent: "center"
};

const eyebrowStyle = {
  margin: "0 0 12px",
  color: "#087f8c",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase"
} as const;

const titleStyle = {
  margin: 0,
  color: "#10202a",
  fontSize: "clamp(34px, 7vw, 64px)",
  lineHeight: 0.98,
  letterSpacing: "-0.065em"
};

const bodyStyle = {
  margin: "22px 0 0",
  color: "#52606d",
  fontSize: "15px",
  lineHeight: 1.7,
  maxWidth: "470px"
};

const formStyle = {
  display: "grid",
  gap: "16px",
  border: "1px solid #e2e8f0",
  borderRadius: "24px",
  background: "#ffffff",
  padding: "24px"
};

const fieldStyle = {
  display: "grid",
  gap: "8px"
};

const labelStyle = {
  color: "#334e68",
  fontSize: "13px",
  fontWeight: 700
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5df",
  borderRadius: "14px",
  background: "#fbfcfd",
  color: "#10202a",
  font: "inherit",
  padding: "12px 14px",
  outlineColor: "#087f8c"
} as const;

const buttonStyle = {
  border: "0",
  borderRadius: "14px",
  background: "#0f7180",
  color: "#ffffff",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 800,
  padding: "13px 16px",
  boxShadow: "0 12px 24px rgba(15, 113, 128, 0.24)"
};

const errorStyle = {
  margin: 0,
  border: "1px solid #fecaca",
  borderRadius: "12px",
  background: "#fff1f2",
  color: "#991b1b",
  fontSize: "13px",
  padding: "10px 12px"
};

const successStyle = {
  margin: 0,
  border: "1px solid #a7f3d0",
  borderRadius: "12px",
  background: "#ecfdf5",
  color: "#047857",
  fontSize: "13px",
  padding: "10px 12px"
};
