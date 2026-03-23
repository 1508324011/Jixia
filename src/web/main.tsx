import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app';

export function mountWebApp(element: Element): void {
  createRoot(element).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

const rootElement = document.getElementById('root');

if (rootElement) {
  mountWebApp(rootElement);
}
