import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";

function renderFoundationApp(): void {
  const rootElement = document.querySelector<HTMLElement>("#root");
  if (rootElement === null) {
    throw new Error("Missing #root element for Jixia web app.");
  }

  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

renderFoundationApp();
