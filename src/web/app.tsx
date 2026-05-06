import { BrowserRouter } from "react-router-dom";

import { AppShell } from "./components/app-shell";
import { AppRouter } from "./router";
import "./styles/app.css";

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <AppRouter />
      </AppShell>
    </BrowserRouter>
  );
}
