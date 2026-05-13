import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import type { LoginProfileKey } from "@shared/contracts/session";

import { useSessionAuth } from "../lib/session-auth";

const LAB_USERS = [
  { label: "Alice · alice@example.test", loginProfileKey: "alice" },
  { label: "Bob · bob@example.test", loginProfileKey: "bob" },
  { label: "Charlie · charlie@example.test", loginProfileKey: "charlie" },
] as const;

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { error, isAuthenticated, isLoading, login } = useSessionAuth();
  const [selectedLoginProfileKey, setSelectedLoginProfileKey] = useState<LoginProfileKey>(
    LAB_USERS[0].loginProfileKey,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const redirectTarget = useMemo(() => {
    const redirect = new URLSearchParams(location.search).get("redirect");
    return redirect && redirect.startsWith("/") ? redirect : "/home";
  }, [location.search]);

  if (!isLoading && isAuthenticated) {
    return <Navigate replace to={redirectTarget} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    try {
      await login({ loginProfileKey: selectedLoginProfileKey });
      navigate(redirectTarget, { replace: true });
    } catch (loginError) {
      setSubmitError(
        loginError instanceof Error ? loginError.message : "登录失败。",
      );
    }
  }

  return (
    <main className="page-shell page-shell--centered">
      <header className="page-header">
        <p className="page-kicker">Personal-first research workspace</p>
        <h1 className="page-title">登录</h1>
        <p className="page-description">
          登录后直接进入个人工作台，继续当天最重要的研究上下文。
        </p>
      </header>

      <form className="panel settings-surface" onSubmit={handleSubmit}>
        <label className="field-stack">
          <span className="field-label">选择实验室用户</span>
          <select
            aria-label="选择实验室用户"
            value={selectedLoginProfileKey}
            onChange={(event) => setSelectedLoginProfileKey(event.target.value as LoginProfileKey)}
          >
            {LAB_USERS.map((user) => (
              <option key={user.loginProfileKey} value={user.loginProfileKey}>
                {user.label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={isLoading}>
          {isLoading ? "登录中…" : "进入工作台"}
        </button>

        {submitError || error ? (
          <p className="quiet-copy" aria-live="polite">
            {submitError ?? error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
