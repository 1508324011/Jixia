import { Navigate, Route, Routes } from 'react-router-dom';

import { LibraryPage } from './pages/library-page';
import { ReaderPage } from './pages/reader-page';
import { SpacesPage } from './pages/spaces-page';
import { WritingPage } from './pages/writing-page';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/spaces" />} />
      <Route path="/spaces" element={<SpacesPage />} />
      <Route
        path="/spaces/:spaceId/projects/:projectId/library"
        element={<LibraryPage />}
      />
      <Route
        path="/spaces/:spaceId/projects/:projectId/library/:entryId/reader"
        element={<ReaderPage />}
      />
      <Route
        path="/spaces/:spaceId/projects/:projectId/writing/:docId"
        element={<WritingPage />}
      />
    </Routes>
  );
}
