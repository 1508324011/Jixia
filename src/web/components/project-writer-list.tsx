import { Link } from 'react-router-dom';

interface ProjectWriterListProps {
  projectId: string;
}

const writerDocuments = [
  {
    id: 'doc-1',
    title: 'Tumor board literature synthesis',
    status: 'draft',
    summary: '将共享评论、AI 结论与可引用段落整理为正式输出。',
  },
] as const;

export function ProjectWriterList({ projectId }: ProjectWriterListProps) {
  return (
    <div className="panel-grid" aria-label="project writer documents">
      {writerDocuments.map((document) => (
        <article key={document.id} className="panel">
          <div className="status-badge">{document.status}</div>
          <h3 className="panel-title">{document.title}</h3>
          <p className="quiet-copy">{document.summary}</p>
          <Link
            className="panel-link"
            to={`/spaces/shared-space/projects/${projectId}/writing/${document.id}`}
          >
            打开 Writer 文稿
          </Link>
        </article>
      ))}
    </div>
  );
}
