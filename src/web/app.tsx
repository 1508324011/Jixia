import { BrowserRouter } from 'react-router-dom';

import { AppRouter } from './router';
import './styles/app.css';

export function App() {
  return (
    <BrowserRouter>
      <div className="app-shell" data-testid="app-shell">
        <AppRouter />
      </div>
    </BrowserRouter>
  );
}
