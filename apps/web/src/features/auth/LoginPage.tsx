import type { LoginRequest, LoginResponse } from "@jixia/shared";
import type { FormEvent } from "react";
import { useState } from "react";

import { apiFetch } from "../../lib/api";

type LoginPageProps = {
  readonly onLoginSuccess?: (response: LoginResponse) => void;
};

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const payload: LoginRequest = { email, password };

    try {
      const response = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        json: payload
      });
      setStatus("success");
      onLoginSuccess?.(response);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    }
  }

  return (
    <main style={pageStyle}>
      <section style={introStyle} aria-labelledby="login-title">
        <p style={eyebrowStyle}>Jixia server-first MVP</p>
        <h1 id="login-title" style={titleStyle}>
          Sign in to the research workbench.
        </h1>
        <p style={introCopyStyle}>
          Sessions are issued by the API as HttpOnly cookies. The browser form submits credentials
          only for this request and never stores auth tokens.
        </p>
      </section>

      <form style={formStyle} onSubmit={handleSubmit} aria-describedby="login-helper">
        <div style={brandStripStyle} aria-hidden="true" />
        <div>
          <p style={formKickerStyle}>Secure lab access</p>
          <h2 style={formTitleStyle}>Log in</h2>
        </div>

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
          <span style={labelStyle}>Password</span>
          <input
            autoComplete="current-password"
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
            Signed in. Loading your workbench…
          </p>
        ) : null}

        <button disabled={status === "submitting"} style={buttonStyle} type="submit">
          {status === "submitting" ? "Signing in…" : "Sign in"}
        </button>

        <p id="login-helper" style={helperStyle}>
          Access is invite-only. Ask a SpaceAdmin for an invitation if you do not have an account.
        </p>
      </form>
    </main>
  );
}

type FormStatus = "idle" | "submitting" | "success" | "error";

const pageStyle = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 430px)",
  alignItems: "center",
  gap: "48px",
  padding: "clamp(28px, 6vw, 76px)",
  background:
    "radial-gradient(circle at 18% 20%, rgba(8, 127, 140, 0.13), transparent 32%), linear-gradient(135deg, #f8f5ef 0%, #edf5f4 100%)",
  color: "#17212b",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
};

const introStyle = {
  maxWidth: "650px"
};

const eyebrowStyle = {
  margin: "0 0 14px",
  color: "#087f8c",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase"
} as const;

const titleStyle = {
  margin: 0,
  color: "#10202a",
  fontSize: "clamp(38px, 8vw, 76px)",
  lineHeight: 0.95,
  letterSpacing: "-0.07em"
};

const introCopyStyle = {
  margin: "24px 0 0",
  color: "#52606d",
  fontSize: "16px",
  lineHeight: 1.75,
  maxWidth: "540px"
};

const formStyle = {
  position: "relative",
  display: "grid",
  gap: "18px",
  padding: "34px",
  border: "1px solid rgba(148, 163, 184, 0.38)",
  borderRadius: "28px",
  background: "rgba(255, 255, 255, 0.88)",
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.14)",
  backdropFilter: "blur(18px)",
  overflow: "hidden"
} as const;

const brandStripStyle = {
  position: "absolute",
  inset: "0 0 auto",
  height: "5px",
  background: "linear-gradient(90deg, #087f8c, #5bb8c2, #d6a23a)"
} as const;

const formKickerStyle = {
  margin: 0,
  color: "#087f8c",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase"
} as const;

const formTitleStyle = {
  margin: "8px 0 0",
  color: "#1f2933",
  fontSize: "24px",
  letterSpacing: "-0.04em"
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

const helperStyle = {
  margin: 0,
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.6
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
