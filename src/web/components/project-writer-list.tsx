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
              error instanceof Error ? error.message : 'Failed to load the Project Docs preview.',
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
    <div className="panel-grid" aria-label="project docs documents">
      {isLoading ? (
        <article className="panel">
          <h3 className="panel-title">Loading Project Docs preview…</h3>
          <p className="quiet-copy">Checking whether a shared Project Doc already exists.</p>
        </article>
      ) : loadError ? (
        <article className="panel">
          <h3 className="panel-title">Project Docs preview unavailable</h3>
          <p className="quiet-copy">{loadError}</p>
        </article>
      ) : document ? (
        <article className="panel">
          <h3 className="panel-title">Known Project Doc</h3>
          <p className="quiet-copy">
            Open the server-owned project document that was already shared with this project.
          </p>
          <Link
            className="panel-link"
            to={`/projects/${projectId}/writing/${document.id}`}
          >
            Open Project Doc
          </Link>
        </article>
      ) : (
        <article className="panel">
          <h3 className="panel-title">No Project Doc selected yet</h3>
          <p className="quiet-copy">
            Use Project Docs to turn governed Reader evidence or adopted Library sources into shared project knowledge before reopening it here.
          </p>
          <Link className="panel-link" to={`/projects/${projectId}/library`}>
            Open project library
          </Link>
        </article>
      )}
    </div>
  );
}
