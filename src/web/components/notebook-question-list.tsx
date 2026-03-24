interface NotebookQuestionListProps {
  noteCount: number;
  paperTitle: string;
}

const defaultQuestions = [
  'What changes my interpretation of this paper?',
  'Which claim deserves a project-level reference?',
  'What follow-up question should stay private for now?',
];

export function NotebookQuestionList({ noteCount, paperTitle }: NotebookQuestionListProps) {
  return (
    <section className="panel" aria-label="notebook questions">
      <p className="page-kicker">Private notebook prompts</p>
      <h2 className="panel-title">Notebook questions</h2>
      <p className="quiet-copy">
        Use the private lane to pressure-test {paperTitle} before anything becomes a project-owned
        reference. Current note count · {noteCount}
      </p>
      <ul className="recent-opened-panel__list">
        {defaultQuestions.map((question) => (
          <li key={question} className="recent-opened-panel__item">
            <div className="recent-opened-panel__meta">
              <span className="status-badge">question</span>
              <strong>{question}</strong>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
