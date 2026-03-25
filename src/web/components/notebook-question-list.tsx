import type { NotebookQuestionView } from '@shared/contracts/reading';
import { defaultNotebookQuestionPrompts } from '@shared/contracts/reading';

interface NotebookQuestionListProps {
  activeQuestionId: string;
  noteCount: number;
  notebookId: string;
  onSelectQuestion: (questionId: string) => void;
  paperTitle: string;
  questions: NotebookQuestionView[];
  retrievalSummary: string;
}

export function NotebookQuestionList({
  activeQuestionId,
  noteCount,
  notebookId,
  onSelectQuestion,
  paperTitle,
  questions,
  retrievalSummary,
}: NotebookQuestionListProps) {
  const resolvedQuestions =
    questions.length > 0
      ? questions
      : defaultNotebookQuestionPrompts.map((prompt, index) => ({
          id: `${notebookId}-question-${index + 1}`,
          prompt,
        }));

  return (
    <section className="panel notebook-question-list" aria-label="notebook questions">
      <div className="stack-xs">
        <p className="page-kicker">Private notebook prompts</p>
        <h2 className="panel-title">Notebook questions</h2>
        <p className="quiet-copy">Notebook · {notebookId}</p>
        <p className="quiet-copy">
          Use the private notebook to pressure-test {paperTitle} before anything becomes a
          project-owned reference. Reader stays an evidence companion while drafting happens in the
          notebook and project docs. Retrieval state · {retrievalSummary}. Current note count · {noteCount}
        </p>
      </div>

      <ul className="recent-opened-panel__list">
        {resolvedQuestions.map((question) => {
          const isActive = question.id === activeQuestionId;

          return (
            <li key={question.id} className="recent-opened-panel__item">
              <button
                type="button"
                className={
                  isActive
                    ? 'notebook-question-list__button notebook-question-list__button--active'
                    : 'notebook-question-list__button'
                }
                aria-label={question.prompt}
                aria-pressed={isActive}
                onClick={() => onSelectQuestion(question.id)}
              >
                <span className="status-badge">{isActive ? 'active prompt' : 'question'}</span>
                <strong>{question.prompt}</strong>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
