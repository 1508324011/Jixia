export function ProjectsPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Shared work</p>
        <h1 className="page-title">项目工作台</h1>
        <p className="page-description">查看共享项目的概览、最近活动和待继续的 Writer 流程。</p>
      </header>

      <div className="panel-grid top-level-surface-grid">
        <section className="panel">
          <h2 className="panel-title">最近活跃项目</h2>
          <p className="quiet-copy">优先返回最近读过 paper 或刚更新 Writer 的项目。</p>
        </section>

        <section className="panel">
          <h2 className="panel-title">共享动态</h2>
          <p className="quiet-copy">集中查看队友评论、项目图书馆新增条目与写作推进情况。</p>
        </section>
      </div>
    </main>
  );
}
