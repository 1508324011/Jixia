interface WorkbenchView {
  current?: boolean;
  label: string;
  to: string;
}

function getProjectId(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 'projects' && segments[1]) {
    return segments[1];
  }

  return null;
}

function getCurrentView(pathname: string): WorkbenchView {
  if (pathname === '/projects' || pathname.startsWith('/projects?')) {
    return { current: true, label: 'Projects', to: '/projects' };
  }

  if (pathname.startsWith('/projects/') && pathname.includes('/writing/')) {
    return { current: true, label: 'Project docs', to: pathname };
  }

  if (pathname.startsWith('/projects/') && pathname.includes('/library/') && pathname.endsWith('/notes')) {
    return { current: true, label: 'Project notes', to: pathname };
  }

  if (pathname.startsWith('/projects/') && pathname.includes('/library/') && pathname.endsWith('/reader')) {
    return { current: true, label: 'Project reader', to: pathname };
  }

  if (pathname.startsWith('/projects/') && pathname.endsWith('/library')) {
    return { current: true, label: 'Project library', to: pathname };
  }

  if (pathname.startsWith('/projects/') && pathname.includes('/library/')) {
    return { current: true, label: 'Project library', to: pathname };
  }

  if (pathname.startsWith('/projects/')) {
    return { current: true, label: 'Project overview', to: pathname };
  }

  if (pathname.startsWith('/library/') && pathname.endsWith('/reader')) {
    return { current: true, label: 'Reader', to: pathname };
  }

  if (pathname.startsWith('/library/') && pathname.endsWith('/notes')) {
    return { current: true, label: 'Notes', to: pathname };
  }

  if (pathname.startsWith('/library')) {
    return { current: true, label: 'Library', to: pathname };
  }

  if (pathname.startsWith('/search')) {
    return { current: true, label: 'Search', to: pathname };
  }

  if (pathname.startsWith('/today')) {
    return { current: true, label: 'Today', to: pathname };
  }

  if (pathname.startsWith('/notebooks')) {
    return { current: true, label: 'Notebooks', to: pathname };
  }

  if (pathname.startsWith('/ai')) {
    return { current: true, label: 'AI workspace', to: pathname };
  }

  if (pathname.startsWith('/settings')) {
    return { current: true, label: 'Settings', to: pathname };
  }

  return { current: true, label: 'Home', to: '/home' };
}

export function getOpenWorkbenchViews(pathname: string): WorkbenchView[] {
  const views: WorkbenchView[] = [];
  const projectId = getProjectId(pathname);

  if (projectId) {
    views.push({ label: 'Project shell', to: `/projects/${projectId}` });

    if (pathname.includes('/library')) {
      views.push({ label: 'Project library', to: `/projects/${projectId}/library` });
    }
  } else {
    views.push({ label: 'Workbench shell', to: '/home' });

    if (pathname.startsWith('/library/')) {
      views.push({ label: 'Personal library', to: '/library' });
    }
  }

  const currentView = getCurrentView(pathname);
  const currentViewIndex = views.findIndex(
    (view) => view.label === currentView.label && view.to === currentView.to,
  );

  if (currentViewIndex >= 0) {
    views[currentViewIndex] = { ...views[currentViewIndex], current: true };
  } else {
    views.push(currentView);
  }

  return views;
}
