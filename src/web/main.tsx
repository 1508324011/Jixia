import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export function mountWebApp(element: Element): void {
  createRoot(element).render(
    <StrictMode>
      <div>Jixia web entry</div>
    </StrictMode>
  );
}
