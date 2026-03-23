const workspaceTabs = [
  'AI 对话',
  '私人笔记',
  '共享评论',
  '关键信息',
] as const;

export function PaperWorkspaceTabs() {
  return (
    <section className="paper-workspace-tabs" aria-label="paper workspace tabs">
      <div
        className="paper-workspace-tabs__list"
        role="tablist"
        aria-label="Paper workspace panels"
      >
        {workspaceTabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={index === 0}
            className={
              index === 0
                ? 'paper-workspace-tabs__tab paper-workspace-tabs__tab--active'
                : 'paper-workspace-tabs__tab'
            }
          >
            {tab}
          </button>
        ))}
      </div>

      <article className="paper-workspace-tabs__panel" aria-label="AI 对话 panel">
        <h3 className="panel-title">AI 对话</h3>
        <p className="quiet-copy">从证据片段发起可追踪的 AI 对话，并保留项目上下文。</p>
      </article>
    </section>
  );
}
