import { useId, useMemo, useState } from 'react';

import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { GovernedJobView } from '@shared/contracts/jobs';
import type { NoteRecord, ReadingRetrievalStateView } from '@shared/contracts/reading';

type WorkspaceTabId = 'ai' | 'private-notes' | 'shared-comments' | 'retrieval';

interface PaperWorkspaceTabsProps {
  governedJob?: GovernedJobView | null;
  insights: GeneratedInsightRecord[];
  privateNotes: NoteRecord[];
  retrieval: ReadingRetrievalStateView;
  sharedComments: NoteRecord[];
}

const workspaceTabs: Array<{ id: WorkspaceTabId; label: string }> = [
  { id: 'ai', label: 'AI 对话' },
  { id: 'private-notes', label: '私人笔记' },
  { id: 'shared-comments', label: '共享评论' },
  { id: 'retrieval', label: '关键信息' },
];

export function PaperWorkspaceTabs({
  governedJob = null,
  insights,
  privateNotes,
  retrieval,
  sharedComments,
}: PaperWorkspaceTabsProps) {
  const idBase = useId();
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('ai');

  const activePanel = useMemo(() => {
    switch (activeTab) {
      case 'private-notes':
        return {
          body:
            privateNotes.length > 0 ? (
              <div className="stack-xs">
                {privateNotes.map((note) => (
                  <p key={note.id} className="quiet-copy">
                    {note.body}
                  </p>
                ))}
              </div>
            ) : (
              <p className="quiet-copy">No private notes yet. Continue in Notes Workspace.</p>
            ),
          description:
            'Private notebook material stays anchored in Notes Workspace; reader only mirrors the evidence-linked state.',
          title: 'Notebook companion state',
        };
      case 'shared-comments':
        return {
          body:
            sharedComments.length > 0 ? (
              <div className="stack-xs">
                {sharedComments.map((note) => (
                  <p key={note.id} className="quiet-copy">
                    {note.body}
                  </p>
                ))}
              </div>
            ) : (
              <p className="quiet-copy">No shared comments yet.</p>
            ),
          description: 'Project-visible comments stay available here while notebook synthesis remains separate.',
          title: 'Shared discussion companion',
        };
      case 'retrieval':
        return {
          body: (
            <div className="stack-xs">
              <p className="status-badge">{retrieval.summary}</p>
              <p className="quiet-copy">{retrieval.detail}</p>
              <p className="quiet-copy">
                Full text available · {retrieval.fullTextAvailable ? 'Yes' : 'No'}
              </p>
            </div>
          ),
          description: 'Keep the evidence boundary visible without pretending the reader is the full synthesis workspace.',
          title: 'Retrieval state',
        };
      case 'ai':
      default:
        return {
          body: (
            <div className="stack-xs">
              {insights.length > 0 ? (
                insights.map((insight) => (
                  <p key={insight.id} className="quiet-copy">
                    {insight.summary}
                  </p>
                ))
              ) : (
                <p className="quiet-copy">No governed insights yet.</p>
              )}
              {governedJob ? (
                <div className="stack-xs paper-workspace-tabs__job-status">
                  <span className="status-badge">{governedJob.job.status}</span>
                  <p className="quiet-copy">
                    {governedJob.events.length} events · {governedJob.audits.length} audit records
                  </p>
                </div>
              ) : null}
            </div>
          ),
          description: 'Trace governed summaries and AI helper outputs back to evidence before you return to notebook or project drafting.',
          title: 'AI evidence companion',
        };
    }
  }, [activeTab, governedJob, insights, privateNotes, retrieval, sharedComments]);

  return (
    <section className="paper-workspace-tabs" aria-label="paper workspace tabs">
      <div
        className="paper-workspace-tabs__list"
        role="tablist"
        aria-label="Paper workspace panels"
      >
        {workspaceTabs.map((tab) => {
          const tabId = `${idBase}-${tab.id}-tab`;
          const panelId = `${idBase}-${tab.id}-panel`;
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              id={tabId}
              type="button"
              role="tab"
              aria-controls={panelId}
              aria-selected={isActive}
              className={
                isActive
                  ? 'paper-workspace-tabs__tab paper-workspace-tabs__tab--active'
                  : 'paper-workspace-tabs__tab'
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <article
        id={`${idBase}-${activeTab}-panel`}
        className="paper-workspace-tabs__panel"
        role="tabpanel"
        aria-labelledby={`${idBase}-${activeTab}-tab`}
      >
        <div className="paper-workspace-tabs__panel-header stack-xs">
          <h3 className="panel-title">{activePanel.title}</h3>
          <p className="quiet-copy">{activePanel.description}</p>
        </div>
        {activePanel.body}
      </article>
    </section>
  );
}
