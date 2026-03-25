export type WorkbenchResumeTargetKind = 'library' | 'notebook' | 'project-doc';

export interface WorkbenchProjectSummary {
  activeNotebookCount: number;
  documentId?: string;
  entryCount: number;
  projectId: string;
  recentActivity: string;
  spaceId: string;
  title: string;
}

export interface WorkbenchResumeTarget {
  description: string;
  kind: WorkbenchResumeTargetKind;
  title: string;
  to: string;
}

export interface WorkbenchRecentImport {
  addedAt: string;
  canonicalId: string;
  entryId: string;
  projectId: string;
  spaceId: string;
  title: string;
  to: string;
}

export interface WorkbenchSummaryResponse {
  recentImports: WorkbenchRecentImport[];
  recentProjects: WorkbenchProjectSummary[];
  resumeTargets: WorkbenchResumeTarget[];
}

export const workbenchContract = 'jixia-workbench-contract';
