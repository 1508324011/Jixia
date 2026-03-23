export function SettingsPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Workspace settings</p>
        <h1 className="page-title">设置</h1>
        <p className="page-description">管理个人导入偏好、AI 连接与阅读工作台默认行为。</p>
      </header>

      <section className="panel settings-surface">
        <label className="field-stack">
          <span className="field-label">API Key</span>
          <input aria-label="API Key" name="apiKey" placeholder="sk-..." />
        </label>
        <label className="field-stack">
          <span className="field-label">默认导入目标</span>
          <select name="defaultImportTarget">
            <option>Personal Library</option>
            <option>Ask every time</option>
          </select>
        </label>
      </section>
    </main>
  );
}
