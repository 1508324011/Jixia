import { Navigate, Route, Routes } from "react-router-dom";

import { JobsPage } from "./pages/jobs-page";
import { LibraryPage } from "./pages/library-page";
import { ProjectsPage } from "./pages/projects-page";
import { ReaderPage } from "./pages/reader-page";
import { SearchPage } from "./pages/search-page";
import { SettingsPage } from "./pages/settings-page";
import { SpacesPage } from "./pages/spaces-page";
import { WritingPage } from "./pages/writing-page";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/projects" />} />
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/spaces" element={<SpacesPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/projects/:projectId/library" element={<LibraryPage />} />
      <Route
        path="/projects/:projectId/library/:entryId/reader"
        element={<ReaderPage />}
      />
      <Route
        path="/projects/:projectId/writing/:docId"
        element={<WritingPage />}
      />
      <Route path="/jobs" element={<JobsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
