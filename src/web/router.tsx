import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { WorkbenchLayout } from './components/workbench-layout';
import { HomePage } from './pages/home-page';
import { LibraryPage } from './pages/library-page';
import { LoginPage } from './pages/login-page';
import { NotesPage } from './pages/notes-page';
import { ProjectPage } from './pages/project-page';
import { ProjectsPage } from './pages/projects-page';
import { ReaderPage } from './pages/reader-page';
import { SearchPage } from './pages/search-page';
import { SpacesPage } from './pages/spaces-page';
import { SettingsPage } from './pages/settings-page';
import { TodayPage } from './pages/today-page';
import { WritingPage } from './pages/writing-page';

const DEFAULT_PROJECT_SPACE_ID = 'shared-space';

function buildCanonicalProjectRoute(pathname: string, spaceId?: string): string {
  if (!spaceId || spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function buildLegacyRedirectRoute(pathname: string, spaceId?: string): string {
  if (!spaceId) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function LegacyProjectLibraryRedirect() {
  const { projectId = 'tumor-board', spaceId } = useParams();

  return (
    <Navigate replace to={buildLegacyRedirectRoute(`/projects/${projectId}/library`, spaceId)} />
  );
}

function LegacyProjectReaderRedirect() {
  const { entryId = 'entry-1', projectId = 'project-1', spaceId } = useParams();

  return (
    <Navigate
      replace
      to={buildLegacyRedirectRoute(`/projects/${projectId}/library/${entryId}/reader`, spaceId)}
    />
  );
}

function LegacyProjectWritingRedirect() {
  const { docId = 'doc-1', projectId = 'project-1', spaceId } = useParams();

  return (
    <Navigate
      replace
      to={buildLegacyRedirectRoute(`/projects/${projectId}/writing/${docId}`, spaceId)}
    />
  );
}

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
        <Route path="/projects/:projectId/library" element={<LibraryPage />} />
        <Route
          path="/projects/:projectId/library/:entryId/reader"
          element={<ReaderPage />}
        />
        <Route path="/projects/:projectId/library/:entryId/notes" element={<NotesPage />} />
        <Route path="/projects/:projectId/writing/:docId" element={<WritingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/spaces" element={<SpacesPage />} />
      <Route path="/spaces/:spaceId/projects/:projectId/library" element={<LegacyProjectLibraryRedirect />} />
      <Route
        path="/spaces/:spaceId/projects/:projectId/library/:entryId/reader"
        element={<LegacyProjectReaderRedirect />}
      />
      <Route
        path="/spaces/:spaceId/projects/:projectId/writing/:docId"
        element={<LegacyProjectWritingRedirect />}
      />
    </Routes>
  );
}
