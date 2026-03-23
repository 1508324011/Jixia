import { RecentOpenedPanel } from '../components/recent-opened-panel';

const dashboardCards = [
  {
    description: '继续今天最重要的推荐阅读与待处理导入。',
    title: '今日推荐',
  },
  {
    description: '从最近停下的位置返回 paper 工作台。',
    title: '最近阅读',
  },
  {
    description: '查看最近进入的共享项目与活动节奏。',
    title: '最近项目',
  },
  {
    description: '接着整理正在成熟中的 Writer 文档。',
    title: '最近文档',
  },
] as const;

export function HomePage() {
  return (
    <main className="page-shell dashboard-page">
      <header className="page-header">
        <p className="page-kicker">Personal-first workbench</p>
        <h1 className="page-title">个人工作台</h1>
        <p className="page-description">从今天最重要的研究上下文继续。</p>
      </header>

      <section className="dashboard-layout" aria-label="home dashboard">
        <div className="panel-grid dashboard-grid">
          {dashboardCards.map((card) => (
            <section key={card.title} className="panel" aria-label={card.title}>
              <h2 className="panel-title">{card.title}</h2>
              <p className="quiet-copy">{card.description}</p>
            </section>
          ))}
        </div>

        <RecentOpenedPanel />
      </section>
    </main>
  );
}
