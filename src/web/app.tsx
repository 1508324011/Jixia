import { BrowserRouter } from "react-router-dom";

import { SessionAuthProvider } from "./lib/session-auth";
import { AppRouter } from "./router";
import "./styles/app.css";

export function App() {
  return (
    <SessionAuthProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </SessionAuthProvider>
  );
}
