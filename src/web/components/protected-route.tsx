import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useSessionAuth } from "../lib/session-auth";

export function ProtectedRoute() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useSessionAuth();

  if (isLoading) {
    return (
      <main className="page-shell page-shell--centered">
        <header className="page-header">
          <p className="page-kicker">Session bootstrap</p>
          <h1 className="page-title">加载中</h1>
          <p className="page-description">
            正在验证当前登录会话，然后再加载工作台数据。
          </p>
        </header>
      </main>
    );
  }

  if (!isAuthenticated) {
    const redirectTo = `${location.pathname}${location.search}${location.hash}`;

    return <Navigate replace to={`/login?redirect=${encodeURIComponent(redirectTo)}`} />;
  }

  return <Outlet />;
}
