import type { SyntheticEvent } from 'react';
import type {
  ProjectWorkspaceActivityKind,
  ProjectWorkspaceResourceKind,
} from '@shared/contracts/projects';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ProjectTabs } from '../components/project-tabs';
import { apiClient } from '../lib/http-client';
import { useProjectWorkspace } from '../presenters/project-workspace-presenter';

const projectTabs = ['概览', '共享 Library', 'Project Docs', '活动'];

function describeWorkspaceKind(
  kind: ProjectWorkspaceActivityKind | ProjectWorkspaceResourceKind,
): string {
  switch (kind) {
    case 'project-doc':
      return 'Project Doc';
    case 'library-entry':
      return 'Project Library';
    case 'reader-comment':
      return 'Reader comment';
    case 'reader-excerpt':
      return 'Reader excerpt';
    case 'job':
      return 'Project job';
    default:
      return kind;
  }
}

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const projectWorkspace = useProjectWorkspace(projectId);
  const { error, isLoading, project, workspace } = projectWorkspace;
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);

  async function handleCreateProjectDoc(event: SyntheticEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!workspace?.docs.canCreate || isCreatingDocument) {
      return;
    }

    const title = newDocumentTitle.trim();

    if (!title) {
      setCreateError('Enter a Project Doc title before creating the shared document.');
      return;
    }

    setCreateError(null);
    setIsCreatingDocument(true);

    try {
      const document = await apiClient.createProjectDoc({
        projectId: workspace.project.id,
        title,
      });

      setNewDocumentTitle('');
      navigate(`/projects/${workspace.project.id}/writing/${document.id}`);
    } catch (creationError) {
      setCreateError(
        creationError instanceof Error
          ? creationError.message
          : 'Failed to create the Project Doc.',
      );
    } finally {
      setIsCreatingDocument(false);
    }
  }

  if (!projectId) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project workspace</p>
          <h1 className="page-title">Project route missing</h1>
          <p className="page-description">
            Select a visible project before opening the collaboration workspace.
          </p>
        </header>

        <section className="panel-grid" aria-label="project route errors">
          <article className="panel">
            <h2 className="panel-title">No project selected</h2>
            <p className="quiet-copy">
              The project workspace cannot load until the route includes a real project id.
            </p>
            <Link className="panel-link" to="/projects">
              Back to projects
            </Link>
          </article>
        </section>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project workspace</p>
          <h1 className="page-title">Loading project workspace…</h1>
          <p className="page-description">Resolving project context from server-owned membership data.</p>
        </header>
      </main>
    );
  }

  if (error || !project || !workspace) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project workspace</p>
          <h1 className="page-title">Project unavailable</h1>
          <p className="page-description">{error ?? `Project ${projectId} is not visible to the current actor.`}</p>
        </header>
      </main>
    );
  }

  const projectLabel = project.project.name;
  const spaceId = project.project.spaceId;
  const docs = workspace.docs.documents;
  const activityItems = workspace.activity.items;
  const resourceItems = workspace.resources.items;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Project workspace</p>
        <h1 className="page-title">{projectLabel}</h1>
        <p className="page-description">
          Project Docs 是项目共享知识中心，用于沉淀背景、证据、rationale、结论和正式文稿。
        </p>
        <p className="quiet-copy">Project / {projectLabel}</p>
      </header>

      <section className="context-bar" aria-label="project context bar">
        <span>Governed by space · {spaceId}</span>
        <span>Your role · {project.membership.role}</span>
        <span className="status-badge">{project.project.status}</span>
        <button className="panel-link" type="button" onClick={() => void projectWorkspace.refresh()}>
          Refresh
        </button>
      </section>
      <section className="panel project-workspace-panel">
        <ProjectTabs tabs={projectTabs} />
        <p className="quiet-copy">
          先从概览进入共享 Library、Project Docs 和协作动态。
        </p>
        <div className="panel-grid" aria-label="project resources summary">
          {resourceItems.length > 0 ? (
            resourceItems.slice(0, 3).map((resource) => (
              <article className="panel" key={resource.id}>
                <p className="page-kicker">{describeWorkspaceKind(resource.kind)}</p>
                <h3 className="panel-title">{resource.title}</h3>
                <p className="quiet-copy">{resource.subtitle ?? 'Project resource'}</p>
                {resource.updatedAt ? (
                  <p className="quiet-copy">Updated {resource.updatedAt}</p>
                ) : null}
                {resource.href ? (
                  <Link className="panel-link" to={resource.href}>
                    Open resource
                  </Link>
                ) : null}
              </article>
            ))
          ) : (
            <article className="panel">
              <h3 className="panel-title">{workspace.resources.emptyState.title}</h3>
              <p className="quiet-copy">{workspace.resources.emptyState.body}</p>
            </article>
          )}
        </div>
        <Link className="panel-link" to={workspace.links.libraryHref}>
          Open project library
        </Link>
      </section>

      <section className="panel" aria-label="Project Docs shared knowledge center">
        <h2 className="panel-title">Project Docs 共享知识中心</h2>
        <p className="quiet-copy">
          维护项目背景、证据、rationale、结论和正式 drafts。所有内容由服务器 ProjectDoc 权限和版本模型管理。
        </p>
        {workspace.docs.canCreate ? (
          <form className="stack-sm" aria-label="create Project Doc" onSubmit={(event) => void handleCreateProjectDoc(event)}>
            <label className="quiet-copy" htmlFor="project-doc-title">
              New Project Doc title
            </label>
            <input
              id="project-doc-title"
              className="draft-editor"
              type="text"
              value={newDocumentTitle}
              disabled={isCreatingDocument}
              placeholder="e.g. Background, evidence rationale, or manuscript draft"
              onChange={(event) => {
                setNewDocumentTitle(event.target.value);
                setCreateError(null);
              }}
            />
            <div className="button-row">
              <button className="action-button" type="submit" disabled={isCreatingDocument}>
                {isCreatingDocument ? 'Creating Project Doc…' : 'Create Project Doc'}
              </button>
            </div>
            {createError ? <p className="quiet-copy">{createError}</p> : null}
          </form>
        ) : (
          <p className="quiet-copy">
            {workspace.docs.createDisabledReason ?? 'Your project role can read visible Project Docs but cannot create shared documents.'}
          </p>
        )}
        <div className="panel-grid" aria-label="project docs index">
          {docs.length > 0 ? (
            docs.map((document) => (
              <article className="panel" key={document.documentId}>
                <h3 className="panel-title">{document.title}</h3>
                <p className="quiet-copy">
                  Updated {document.updatedAt} · Version {document.latestVersion?.versionNumber ?? 0}
                </p>
                <p className="quiet-copy">
                  Document · {document.documentId}
                </p>
                <p className="quiet-copy">
                  Latest version · {document.latestVersion?.versionId ?? 'No saved version'}
                </p>
                <span className="status-badge">{document.publishState}</span>
                <Link className="panel-link" to={document.openHref}>
                  Open Project Doc
                </Link>
              </article>
            ))
          ) : (
            <article className="panel">
              <h3 className="panel-title">{workspace.docs.emptyState.title}</h3>
              <p className="quiet-copy">{workspace.docs.emptyState.body}</p>
              <Link className="panel-link" to={workspace.links.libraryHref}>
                Open project library
              </Link>
            </article>
          )}
        </div>
      </section>

      <section className="panel" aria-label="Project activity">
        <h2 className="panel-title">Project activity</h2>
        <p className="quiet-copy">
          Server-owned continuation signals from project-scoped records. Private notes and personal Notebook state are not included.
        </p>
        <div className="panel-grid" aria-label="project activity feed">
          {activityItems.length > 0 ? (
            activityItems.map((activity) => (
              <article className="panel" key={activity.id}>
                <p className="page-kicker">{activity.sourceLabel ?? describeWorkspaceKind(activity.kind)}</p>
                <h3 className="panel-title">{activity.title}</h3>
                <p className="quiet-copy">{activity.summary}</p>
                <p className="quiet-copy">Occurred {activity.occurredAt}</p>
                {activity.href ? (
                  <Link className="panel-link" to={activity.href}>
                    Resume from activity
                  </Link>
                ) : null}
              </article>
            ))
          ) : (
            <article className="panel">
              <h3 className="panel-title">{workspace.activity.emptyState.title}</h3>
              <p className="quiet-copy">{workspace.activity.emptyState.body}</p>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
