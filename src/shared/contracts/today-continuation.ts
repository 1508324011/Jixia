export const todayContinuationContract = 'jixia.today.continuation.v1';

export type TodayContinuationPriority = 'high' | 'medium' | 'low';

export type TodayContinuationSectionKind =
  | 'in_progress_reading'
  | 'new_imports'
  | 'notebook_drafts'
  | 'project_review'
  | 'ai_jobs';

export type TodayContinuationActionSource =
  | 'library'
  | 'reader'
  | 'notebook'
  | 'project'
  | 'ai_job';

export interface TodayContinuationSummary {
  aiJobsNeedingAction: number;
  inProgressReadings: number;
  notebookDrafts: number;
  projectReviewItems: number;
  unreadImports: number;
}

export interface TodayContinuationEmptyState {
  body: string;
  href?: string;
  title: string;
}

export interface TodayContinuationItem {
  href: string;
  id: string;
  kind: TodayContinuationSectionKind;
  priority: TodayContinuationPriority;
  sourceLabel?: string;
  summary?: string;
  timestamp?: string;
  title: string;
}

export interface TodayContinuationSection {
  description: string;
  emptyState: TodayContinuationEmptyState;
  items: TodayContinuationItem[];
  kind: TodayContinuationSectionKind;
  title: string;
  totalCount: number;
}

export interface TodayContinuationAction {
  description?: string;
  href: string;
  id: string;
  label: string;
  priority: TodayContinuationPriority;
  reason: string;
  source: TodayContinuationActionSource;
}

export interface TodayContinuationResponse {
  contract: typeof todayContinuationContract;
  emptyState: TodayContinuationEmptyState;
  generatedAt: string;
  nextActions: TodayContinuationAction[];
  sections: TodayContinuationSection[];
  summary: TodayContinuationSummary;
}
