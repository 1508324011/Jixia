# Jixia Web Interaction Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal-dashboard-first Jixia web workbench with stable task navigation, personal/project context cues, recent-item quick switching, and the approved paper/project/writer interaction model.

**Architecture:** Extend the existing React Router shell instead of replacing it wholesale. Introduce a persistent authenticated workbench layout around new top-level routes (`/login`, `/home`, `/today`, `/search`, `/library`, `/projects`, `/settings`), then adapt current library/reader/writing pages into personal/project-aware work surfaces. Keep `space` implicit in the UI language while preserving it in routing, API contracts, and permission checks.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, existing `src/web` pages/components/styles, existing `src/server/http-api.ts`, `src/shared/contracts/*`, and `src/web/lib/demo-api.ts`.

---

### Task 1: Login route and persistent workbench shell

**Files:**
- Create: `src/web/pages/login-page.tsx`
- Create: `src/web/components/workbench-layout.tsx`
- Create: `src/web/components/sidebar-nav.tsx`
- Create: `src/web/components/context-indicator.tsx`
- Modify: `src/web/router.tsx`
- Modify: `src/web/app.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-routing.test.tsx`

**Step 1: Write the failing test**

```tsx
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import { AppRouter } from '../../src/web/router';

test('redirects authenticated users to /home and renders stable nav', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AppRouter />
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: '今日推荐' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '搜索' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-routing.test.tsx`
Expected: FAIL because `/home` route and persistent workbench nav do not exist yet.

**Step 3: Write minimal implementation**

```tsx
// src/web/router.tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<WorkbenchLayout />}>
    <Route path="/" element={<Navigate replace to="/home" />} />
    <Route path="/home" element={<HomePage />} />
    <Route path="/today" element={<TodayPage />} />
    <Route path="/search" element={<SearchPage />} />
    <Route path="/library" element={<LibraryPage />} />
    <Route path="/projects" element={<ProjectsPage />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Route>
</Routes>
```

```tsx
// src/web/components/workbench-layout.tsx
export function WorkbenchLayout() {
  return (
    <div className="workbench-shell">
      <SidebarNav />
      <main className="workbench-main">
        <ContextIndicator label="Personal" />
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-routing.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-routing.test.tsx src/web/pages/login-page.tsx src/web/components/workbench-layout.tsx src/web/components/sidebar-nav.tsx src/web/components/context-indicator.tsx src/web/router.tsx src/web/app.tsx src/web/styles/app.css
git commit -m "feat: add workbench shell routes"
```

### Task 2: Personal dashboard home and recent-opened rail

**Files:**
- Create: `src/web/pages/home-page.tsx`
- Create: `src/web/components/recent-opened-panel.tsx`
- Create: `src/web/lib/recent-opened-store.ts`
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/home-page.test.tsx`

**Step 1: Write the failing test**

```tsx
test('home page shows dashboard summary cards and recent-opened panel', () => {
  renderHomePage();

  expect(screen.getByText('个人工作台')).toBeInTheDocument();
  expect(screen.getByText('今日推荐')).toBeInTheDocument();
  expect(screen.getByText('最近阅读')).toBeInTheDocument();
  expect(screen.getByText('最近项目')).toBeInTheDocument();
  expect(screen.getByText('最近文档')).toBeInTheDocument();
  expect(screen.getByText('最近打开')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/home-page.test.tsx`
Expected: FAIL because `HomePage` and `RecentOpenedPanel` do not exist yet.

**Step 3: Write minimal implementation**

```tsx
export function HomePage() {
  return (
    <section className="dashboard-page">
      <header>
        <h1>个人工作台</h1>
        <p>从今天最重要的研究上下文继续。</p>
      </header>
      <div className="dashboard-grid">
        <section aria-label="今日推荐" />
        <section aria-label="最近阅读" />
        <section aria-label="最近项目" />
        <section aria-label="最近文档" />
      </div>
      <RecentOpenedPanel />
    </section>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/home-page.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/home-page.test.tsx src/web/pages/home-page.tsx src/web/components/recent-opened-panel.tsx src/web/lib/recent-opened-store.ts src/web/components/workbench-layout.tsx src/web/styles/app.css
git commit -m "feat: add personal dashboard home"
```

### Task 3: Today, Search, Settings, and Projects top-level surfaces

**Files:**
- Create: `src/web/pages/today-page.tsx`
- Create: `src/web/pages/search-page.tsx`
- Create: `src/web/pages/settings-page.tsx`
- Create: `src/web/pages/projects-page.tsx`
- Modify: `src/web/router.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-navigation.test.tsx`

**Step 1: Write the failing test**

```tsx
test('sidebar switches among approved top-level surfaces', async () => {
  renderWorkbench('/home');

  await user.click(screen.getByRole('link', { name: '搜索' }));
  expect(screen.getByRole('heading', { name: '外部搜索' })).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: 'Projects' }));
  expect(screen.getByRole('heading', { name: '项目工作台' })).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: '设置' }));
  expect(screen.getByLabelText('API Key')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-navigation.test.tsx`
Expected: FAIL because these pages and labels do not exist yet.

**Step 3: Write minimal implementation**

```tsx
export function SearchPage() {
  return (
    <section>
      <h1>外部搜索</h1>
      <p>搜索外部文献并导入到个人 Library。</p>
    </section>
  );
}

export function SettingsPage() {
  return (
    <section>
      <h1>设置</h1>
      <label>
        API Key
        <input name="apiKey" aria-label="API Key" />
      </label>
    </section>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-navigation.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-navigation.test.tsx src/web/pages/today-page.tsx src/web/pages/search-page.tsx src/web/pages/settings-page.tsx src/web/pages/projects-page.tsx src/web/router.tsx src/web/components/sidebar-nav.tsx src/web/styles/app.css
git commit -m "feat: add workbench top-level surfaces"
```

### Task 4: Personal library route and project workspace route split

**Files:**
- Modify: `src/web/router.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Create: `src/web/pages/project-page.tsx`
- Create: `src/web/components/project-tabs.tsx`
- Modify: `src/web/components/context-indicator.tsx`
- Test: `tests/ui/library-and-project-context.test.tsx`

**Step 1: Write the failing test**

```tsx
test('library and project workspace expose different context labels', () => {
  renderWorkbench('/library');
  expect(screen.getByText('Personal')).toBeInTheDocument();

  renderWorkbench('/projects/project-1');
  expect(screen.getByText('Project / 肿瘤标志物项目')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '共享 Library' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Writer' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/library-and-project-context.test.tsx`
Expected: FAIL because `/library` and `/projects/:projectId` do not have distinct context-aware shells yet.

**Step 3: Write minimal implementation**

```tsx
// src/web/router.tsx
<Route path="/library" element={<LibraryPage mode="personal" />} />
<Route path="/projects/:projectId" element={<ProjectPage />} />

// src/web/pages/project-page.tsx
export function ProjectPage() {
  return (
    <section>
      <ContextIndicator label="Project / 肿瘤标志物项目" />
      <ProjectTabs tabs={['概览', '共享 Library', 'Writer', '活动']} />
    </section>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/library-and-project-context.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/library-and-project-context.test.tsx src/web/router.tsx src/web/pages/library-page.tsx src/web/pages/project-page.tsx src/web/components/project-tabs.tsx src/web/components/context-indicator.tsx
git commit -m "feat: split personal and project workspaces"
```

### Task 5: Paper workspace panels for AI, private notes, shared comments, and metadata

**Files:**
- Create: `src/web/components/paper-workspace-tabs.tsx`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/paper-workspace.test.tsx`

**Step 1: Write the failing test**

```tsx
test('paper page exposes separate panels for AI, private notes, shared comments, and metadata', async () => {
  renderWorkbench('/projects/project-1/library/entry-1/reader');

  expect(screen.getByRole('tab', { name: 'AI 对话' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '私人笔记' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '共享评论' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '关键信息' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/paper-workspace.test.tsx`
Expected: FAIL because current `ReaderPage` does not expose the approved panel model.

**Step 3: Write minimal implementation**

```tsx
export function PaperWorkspaceTabs() {
  return (
    <TabList>
      <Tab>AI 对话</Tab>
      <Tab>私人笔记</Tab>
      <Tab>共享评论</Tab>
      <Tab>关键信息</Tab>
    </TabList>
  );
}

// src/web/pages/reader-page.tsx
<section className="reader-page">
  <article className="paper-surface" />
  <aside className="paper-workspace">
    <PaperWorkspaceTabs />
  </aside>
</section>
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/paper-workspace.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/paper-workspace.test.tsx src/web/components/paper-workspace-tabs.tsx src/web/pages/reader-page.tsx src/web/styles/app.css
git commit -m "feat: add paper workspace panels"
```

### Task 6: Project writer integration and mature-content flow cues

**Files:**
- Modify: `src/web/pages/project-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Create: `src/web/components/project-writer-list.tsx`
- Test: `tests/ui/project-writer-flow.test.tsx`

**Step 1: Write the failing test**

```tsx
test('project page links shared paper work into Project Docs documents', async () => {
  renderWorkbench('/projects/project-1');

  expect(screen.getByText('Project Docs 共享知识中心')).toBeInTheDocument();
  expect(screen.getByText('将成熟内容整理进入 Project Docs')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/project-writer-flow.test.tsx`
Expected: FAIL because project-to-writer integration cues are missing.

**Step 3: Write minimal implementation**

```tsx
// src/web/pages/project-page.tsx
<section aria-label="Project Docs shared knowledge center">
  <h2>Project Docs 共享知识中心</h2>
  <p>将成熟内容整理进入 Project Docs。</p>
  <ProjectWriterList />
</section>
```

Implementation note: `ProjectWriterList` should discover an existing shared draft through
`GET /api/projects/:projectId/writing-document` before it links into
`/projects/:projectId/writing/:docId`. `GET /api/project-docs/:documentId` should then return the
latest saved snapshot for that document, or a server-authored empty snapshot with empty content,
empty citations, and `versionNumber: 0` when the document exists but no saved version exists yet.
The writing surface should also serialize Save vs Reload requests so an older refresh response
cannot overwrite a newer saved snapshot during stress clicks.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/project-writer-flow.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/project-writer-flow.test.tsx src/web/pages/project-page.tsx src/web/pages/writing-page.tsx src/web/components/project-writer-list.tsx
git commit -m "feat: connect projects to writer workspace"
```

### Task 7: Search/recommendation/settings HTTP contracts for the approved workbench model

**Files:**
- Create: `src/shared/contracts/discovery.ts`
- Create: `src/shared/contracts/settings.ts`
- Modify: `src/shared/index.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/lib/demo-api.ts`
- Test: `tests/integration/workbench-http-contracts.test.ts`

**Step 1: Write the failing test**

```ts
it('exposes discovery and settings endpoints for the workbench shell', async () => {
  const response = await request(server).get('/api/discovery/today');
  expect(response.status).toBe(200);
  expect(response.body.items).toBeDefined();

  const settings = await request(server).get('/api/settings/me');
  expect(settings.status).toBe(200);
  expect(settings.body.apiKeyConfigured).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/workbench-http-contracts.test.ts`
Expected: FAIL because the new workbench contracts do not exist yet.

**Step 3: Write minimal implementation**

```ts
// src/shared/contracts/discovery.ts
export interface TodayRecommendation {
  id: string;
  title: string;
  reason: string;
  imported: boolean;
}

// src/server/http-api.ts
if (pathname === '/api/discovery/today' && request.method === 'GET') {
  return json({ items: [] });
}

if (pathname === '/api/settings/me' && request.method === 'GET') {
  return json({ apiKeyConfigured: false });
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/workbench-http-contracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/workbench-http-contracts.test.ts src/shared/contracts/discovery.ts src/shared/contracts/settings.ts src/shared/index.ts src/server/http-api.ts src/web/lib/demo-api.ts
git commit -m "feat: add workbench discovery and settings contracts"
```

### Task 8: End-to-end shell verification and documentation sync

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Test: `tests/ui/paper-workspace.test.tsx`
- Test: `tests/integration/workbench-http-contracts.test.ts`

**Step 1: Write the failing doc/test expectation**

```ts
it('documents the new workbench surfaces in the README', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme).toContain('个人工作台首页');
  expect(readme).toContain('今日推荐');
  expect(readme).toContain('Projects');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-navigation.test.tsx tests/ui/paper-workspace.test.tsx tests/integration/workbench-http-contracts.test.ts`
Expected: FAIL if docs and final shell expectations are not yet aligned.

**Step 3: Write minimal implementation**

Update docs so they describe:

- login → personal dashboard → top-level navigation
- personal vs project context indicators
- paper workspace panels
- project writer flow

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-routing.test.tsx tests/ui/home-page.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/paper-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/workbench-http-contracts.test.ts`
Expected: PASS.

Then run:

- `npm test`
- `npm run typecheck`
- `npm run build`

Expected: all PASS.

**Step 5: Commit**

```bash
git add README.md README_CN.md docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md tests/ui/workbench-routing.test.tsx tests/ui/home-page.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/paper-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/workbench-http-contracts.test.ts
git commit -m "feat: land workbench interaction shell"
```
