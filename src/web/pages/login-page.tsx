import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useSessionAuth } from "../lib/session-auth";

const LAB_USERS = [
  { id: "user-alice", label: "Alice · alice@example.test" },
  { id: "user-bob", label: "Bob · bob@example.test" },
  { id: "user-charlie", label: "Charlie · charlie@example.test" },
] as const;

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { error, isAuthenticated, isLoading, login } = useSessionAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>(LAB_USERS[0].id);
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
      await login({ userId: selectedUserId });
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
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            {LAB_USERS.map((user) => (
              <option key={user.id} value={user.id}>
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
