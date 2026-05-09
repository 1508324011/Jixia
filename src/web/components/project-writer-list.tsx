import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { ProjectDocRecord } from '@shared/contracts/project-docs';

import { ApiError, apiClient } from '../lib/http-client';

interface ProjectWriterListProps {
  projectId: string;
}

export function ProjectWriterList({ projectId }: ProjectWriterListProps) {
  const [document, setDocument] = useState<ProjectDocRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDocument(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const nextDocument = await apiClient.getLatestProjectDoc(projectId);

        if (!isCancelled) {
          setDocument(nextDocument);
        }
      } catch (error) {
        if (!isCancelled) {
          if (error instanceof ApiError && error.status === 404) {
            setDocument(null);
            setLoadError(null);
          } else {
            setDocument(null);
            setLoadError(
              error instanceof Error ? error.message : 'Failed to load the Writer preview.',
            );
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  return (
    <div className="panel-grid" aria-label="project writer documents">
      {isLoading ? (
        <article className="panel">
          <h3 className="panel-title">Loading Writer preview…</h3>
          <p className="quiet-copy">Checking whether a promoted draft already exists.</p>
        </article>
      ) : loadError ? (
        <article className="panel">
          <h3 className="panel-title">Writer preview unavailable</h3>
          <p className="quiet-copy">{loadError}</p>
        </article>
      ) : document ? (
        <article className="panel">
          <h3 className="panel-title">Known Writer draft</h3>
          <p className="quiet-copy">
            Open the server-owned project document that was already shared with this project.
          </p>
          <Link
            className="panel-link"
            to={`/projects/${projectId}/writing/${document.id}`}
          >
            打开 Writer 文稿
          </Link>
        </article>
      ) : (
        <article className="panel">
          <h3 className="panel-title">No Writer draft selected yet</h3>
          <p className="quiet-copy">
            Promote a governed Reader insight to create a project document before reopening it here.
          </p>
          <Link className="panel-link" to={`/projects/${projectId}/library`}>
            Open project library
          </Link>
        </article>
      )}
    </div>
  );
}
