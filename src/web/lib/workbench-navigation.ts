import { matchPath } from 'react-router-dom';
import {
  Bot,
  BookOpen,
  FileText,
  FolderKanban,
  Home,
  NotebookTabs,
  Search,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export type WorkbenchSection =
  | 'home'
  | 'today'
  | 'search'
  | 'library'
  | 'notebook'
  | 'projects'
  | 'spaces'
  | 'reader'
  | 'writing'
  | 'ai-workspace'
  | 'jobs'
  | 'settings';

export interface WorkbenchNavigationItem {
  icon: LucideIcon;
  key: WorkbenchSection;
  label: string;
  shortLabel?: string;
  subtitle: string;
  to: string;
}

export interface WorkbenchRouteContext {
  currentSection: WorkbenchSection;
  docId?: string;
  entryId?: string;
  projectId?: string;
  spaceId?: string;
}

export const workbenchNavigationItems: WorkbenchNavigationItem[] = [
  {
    icon: Home,
    key: 'home',
    label: 'Home',
    shortLabel: '首页',
    subtitle: 'Server cockpit',
    to: '/home',
  },
  {
    icon: BookOpen,
    key: 'today',
    label: '今日推荐',
    subtitle: 'Discovery feed',
    to: '/today',
  },
  {
    icon: Search,
    key: 'search',
    label: '搜索',
    shortLabel: 'Search',
    subtitle: 'Discover and import',
    to: '/search',
  },
  {
    icon: FileText,
    key: 'library',
    label: 'Library',
    subtitle: 'Personal and project assets',
    to: '/library',
  },
  {
    icon: NotebookTabs,
    key: 'notebook',
    label: 'Notebook',
    subtitle: 'Private synthesis',
    to: '/notebook',
  },
  {
    icon: FolderKanban,
    key: 'projects',
    label: 'Projects',
    subtitle: 'Collaboration lanes',
    to: '/projects',
  },
  {
    icon: Sparkles,
    key: 'ai-workspace',
    label: 'AI Workspace',
    subtitle: 'Long-running governed AI work',
    to: '/ai-workspace',
  },
  {
    icon: Bot,
    key: 'jobs',
    label: 'Jobs',
    subtitle: 'Governed AI runtime',
    to: '/jobs',
  },
  {
    icon: Settings,
    key: 'settings',
    label: '设置',
    shortLabel: 'Settings',
    subtitle: 'Credentials and governance',
    to: '/settings',
  },
];

export function deriveWorkbenchRouteContext(pathname: string): WorkbenchRouteContext {
  const legacyProjectReaderMatch = matchPath(
    '/spaces/:spaceId/projects/:projectId/library/:entryId/reader',
    pathname,
  );
  if (
    legacyProjectReaderMatch?.params.spaceId &&
    legacyProjectReaderMatch.params.projectId &&
    legacyProjectReaderMatch.params.entryId
  ) {
    return {
      currentSection: 'reader',
      entryId: legacyProjectReaderMatch.params.entryId,
      projectId: legacyProjectReaderMatch.params.projectId,
      spaceId: legacyProjectReaderMatch.params.spaceId,
    };
  }

  const legacyProjectWritingMatch = matchPath(
    '/spaces/:spaceId/projects/:projectId/writing/:docId',
    pathname,
  );
  if (
    legacyProjectWritingMatch?.params.spaceId &&
    legacyProjectWritingMatch.params.projectId &&
    legacyProjectWritingMatch.params.docId
  ) {
    return {
      currentSection: 'writing',
      docId: legacyProjectWritingMatch.params.docId,
      projectId: legacyProjectWritingMatch.params.projectId,
      spaceId: legacyProjectWritingMatch.params.spaceId,
    };
  }

  const legacyProjectLibraryMatch = matchPath(
    '/spaces/:spaceId/projects/:projectId/library',
    pathname,
  );
  if (legacyProjectLibraryMatch?.params.spaceId && legacyProjectLibraryMatch.params.projectId) {
    return {
      currentSection: 'library',
      projectId: legacyProjectLibraryMatch.params.projectId,
      spaceId: legacyProjectLibraryMatch.params.spaceId,
    };
  }

  const projectReaderMatch = matchPath(
    '/projects/:projectId/library/:entryId/reader',
    pathname,
  );
  if (projectReaderMatch?.params.projectId && projectReaderMatch.params.entryId) {
    return {
      currentSection: 'reader',
      entryId: projectReaderMatch.params.entryId,
      projectId: projectReaderMatch.params.projectId,
    };
  }

  const projectWritingMatch = matchPath(
    '/projects/:projectId/writing/:docId',
    pathname,
  );
  if (projectWritingMatch?.params.projectId && projectWritingMatch.params.docId) {
    return {
      currentSection: 'writing',
      docId: projectWritingMatch.params.docId,
      projectId: projectWritingMatch.params.projectId,
    };
  }

  const projectLibraryMatch = matchPath('/projects/:projectId/library', pathname);
  if (projectLibraryMatch?.params.projectId) {
    return {
      currentSection: 'library',
      projectId: projectLibraryMatch.params.projectId,
    };
  }

  const projectRouteMatch = matchPath('/projects/:projectId', pathname);
  if (projectRouteMatch?.params.projectId) {
    return {
      currentSection: 'projects',
      projectId: projectRouteMatch.params.projectId,
    };
  }

  const personalReaderMatch = matchPath('/library/:entryId/reader', pathname);
  if (personalReaderMatch?.params.entryId) {
    return {
      currentSection: 'reader',
      entryId: personalReaderMatch.params.entryId,
    };
  }

  if (pathname === '/' || pathname === '/home') {
    return { currentSection: 'home' };
  }

  if (pathname === '/today') {
    return { currentSection: 'today' };
  }

  if (pathname === '/search') {
    return { currentSection: 'search' };
  }

  if (pathname === '/library') {
    return { currentSection: 'library' };
  }

  if (pathname === '/notebook') {
    return { currentSection: 'notebook' };
  }

  if (pathname === '/spaces') {
    return { currentSection: 'spaces' };
  }

  if (pathname === '/ai-workspace') {
    return { currentSection: 'ai-workspace' };
  }

  if (pathname === '/jobs') {
    return { currentSection: 'jobs' };
  }

  if (pathname === '/settings') {
    return { currentSection: 'settings' };
  }

  if (pathname === '/projects' || matchPath('/projects/:projectId', pathname)) {
    return { currentSection: 'projects' };
  }

  return { currentSection: 'home' };
}

export function isWorkbenchNavigationItemActive(
  pathname: string,
  section: WorkbenchSection,
): boolean {
  const context = deriveWorkbenchRouteContext(pathname);

  if (section === 'projects') {
    return context.currentSection === 'projects' || context.currentSection === 'writing';
  }

  if (section === 'library') {
    return context.currentSection === 'library' || context.currentSection === 'reader';
  }

  return context.currentSection === section;
}

export function resolveWorkbenchSectionTitle(section: WorkbenchSection): string {
  const navigationItem = workbenchNavigationItems.find((item) => item.key === section);

  if (navigationItem) {
    return navigationItem.shortLabel ?? navigationItem.label;
  }

  switch (section) {
    case 'reader':
      return 'Reader';
    case 'writing':
      return 'Project Docs';
    case 'spaces':
      return 'Spaces';
    default:
      return 'Home';
  }
}

export function resolveWorkbenchNavigationTarget(
  item: WorkbenchNavigationItem,
  context: WorkbenchRouteContext,
  fallbackProjectId?: string,
): string {
  const projectId = context.projectId ?? fallbackProjectId;

  if (item.key === 'library' && projectId && context.currentSection !== 'home') {
    return `/projects/${projectId}/library`;
  }

  if (item.key === 'projects' && projectId && context.currentSection !== 'home') {
    return `/projects/${projectId}`;
  }

  return item.to;
}
