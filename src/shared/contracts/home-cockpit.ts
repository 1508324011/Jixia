import type { ScopeRef } from './projects';
import type { SessionUser } from './session';

export type HomeCockpitSectionId =
  | 'collaboration'
  | 'library'
  | 'writing'
  | 'jobs';

export type HomeCockpitSectionStatus = 'empty' | 'active' | 'attention';

export type HomeCockpitActionPriority = 'primary' | 'secondary';

export type HomeCockpitActivityKind =
  | 'job'
  | 'library'
  | 'notebook'
  | 'project'
  | 'writing';

export type HomeCockpitNoticeTone = 'info' | 'success' | 'warning';

export interface HomeCockpitActor
  extends Pick<SessionUser, 'displayName' | 'email' | 'id'> {}

export interface HomeCockpitWorkbenchContext {
  label: string;
  route: '/home';
  scope: ScopeRef;
}

export interface HomeCockpitMetric {
  detail?: string;
  label: string;
  value: number | string;
}

export interface HomeCockpitLinkAction {
  description: string;
  id: string;
  label: string;
  priority: HomeCockpitActionPriority;
  to: string;
}

export interface HomeCockpitSummarySection {
  description: string;
  id: HomeCockpitSectionId;
  metrics: HomeCockpitMetric[];
  primaryAction: HomeCockpitLinkAction;
  status: HomeCockpitSectionStatus;
  title: string;
}

export interface HomeCockpitActivityItem {
  context: string;
  href?: string;
  id: string;
  kind: HomeCockpitActivityKind;
  occurredAt: string;
  title: string;
}

export interface HomeCockpitNotice {
  body: string;
  id: string;
  title: string;
  tone: HomeCockpitNoticeTone;
}

export interface HomeCockpitResponse {
  actor: HomeCockpitActor;
  contract: typeof homeCockpitContract;
  generatedAt: string;
  nextActions: HomeCockpitLinkAction[];
  notices: HomeCockpitNotice[];
  recentActivity: HomeCockpitActivityItem[];
  sections: HomeCockpitSummarySection[];
  workbench: HomeCockpitWorkbenchContext;
}

export const homeCockpitContract = 'jixia-home-cockpit-contract';
