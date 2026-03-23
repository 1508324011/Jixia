import { Navigate, Route, Routes } from 'react-router-dom';

import { WorkbenchLayout } from './components/workbench-layout';
import { HomePage } from './pages/home-page';
import { LibraryPage } from './pages/library-page';
import { LoginPage } from './pages/login-page';
import { ProjectPage } from './pages/project-page';
import { ProjectsPage } from './pages/projects-page';
import { ReaderPage } from './pages/reader-page';
import { SearchPage } from './pages/search-page';
import { SpacesPage } from './pages/spaces-page';
import { SettingsPage } from './pages/settings-page';
import { TodayPage } from './pages/today-page';
import { WritingPage } from './pages/writing-page';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/home" />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<WorkbenchLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/today" element={<TodayPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/library" element={<LibraryPage mode="personal" />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
      <Route
        path="/projects/:projectId/library/:entryId/reader"
        element={<ReaderPage />}
      />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
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
