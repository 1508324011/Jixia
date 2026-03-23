import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { WritingDocumentView } from '@shared/contracts/writing';

import { createDemoApi } from '../lib/demo-api';

interface ProjectWriterListProps {
  projectId: string;
  spaceId: string;
}

const demoApi = createDemoApi();

export function ProjectWriterList({ projectId, spaceId }: ProjectWriterListProps) {
  const [document, setDocument] = useState<WritingDocumentView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDocument(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await demoApi.getWritingDocument(spaceId, projectId);

        if (!isCancelled) {
          setDocument(response.document);
        }
      } catch (error) {
        if (!isCancelled) {
          if (error instanceof Error && error.message.includes('404')) {
            setDocument(null);
          } else {
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
  }, [projectId, spaceId]);

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
          <div className="status-badge">{document.publishState}</div>
          <h3 className="panel-title">{document.title}</h3>
          <p className="quiet-copy">
            {document.latestSnapshot?.content ?? 'The draft exists but does not have saved content yet.'}
          </p>
          <Link
            className="panel-link"
            to={`/spaces/${spaceId}/projects/${projectId}/writing/${document.documentId}`}
          >
            打开 Writer 文稿
          </Link>
        </article>
      ) : (
        <article className="panel">
          <h3 className="panel-title">No promoted Writer draft yet</h3>
          <p className="quiet-copy">Use Reader to promote a governed insight into Writer.</p>
        </article>
      )}
    </div>
  );
}
