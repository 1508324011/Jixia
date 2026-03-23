export function SearchPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Discovery</p>
        <h1 className="page-title">外部搜索</h1>
        <p className="page-description">搜索外部文献并导入到个人 Library，再决定是否带入项目协作。</p>
      </header>

      <section className="panel search-surface">
        <label className="field-stack">
          <span className="field-label">检索主题</span>
          <input name="query" placeholder="输入关键词、作者或 DOI" />
        </label>
        <p className="quiet-copy">后续这里会接 discovery contract，先用稳定的搜索入口占位。</p>
      </section>
    </main>
  );
}
