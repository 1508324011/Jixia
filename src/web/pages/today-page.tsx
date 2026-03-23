export function TodayPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Today</p>
        <h1 className="page-title">今日推荐</h1>
        <p className="page-description">把今天优先处理的阅读、导入和写作收束到同一入口。</p>
      </header>

      <div className="panel-grid top-level-surface-grid">
        <section className="panel">
          <h2 className="panel-title">待读优先级</h2>
          <p className="quiet-copy">根据最近项目和个人阅读节奏整理今天最该推进的论文。</p>
        </section>

        <section className="panel">
          <h2 className="panel-title">待处理导入</h2>
          <p className="quiet-copy">把搜索结果、外部分享链接和项目指派的条目收进个人 Library。</p>
        </section>
      </div>
    </main>
  );
}
