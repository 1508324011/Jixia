import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const RUNBOOK_PATH = 'docs/runbooks/native-demo-showcase.md';
const README_PATH = 'README.md';
const README_CN_PATH = 'README_CN.md';
const ENV_EXAMPLE_PATH = '.env.example';

function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('native demo runbook contract', () => {
  it('declares the reset command and demo walkthrough guidance', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };
    const envExample = read(ENV_EXAMPLE_PATH);
    const runbook = existsSync(RUNBOOK_PATH) ? read(RUNBOOK_PATH) : '';
    const readme = read(README_PATH);
    const readmeCn = read(README_CN_PATH);

    expect(packageJson.scripts?.['demo:reset']).toBeTruthy();
    expect(existsSync(RUNBOOK_PATH)).toBe(true);
    expect(runbook).toContain('npm run start:server');
    expect(runbook).toContain('npm run demo:reset');
    expect(runbook).toContain('pmid:123456');
    expect(runbook).toContain('/home/zhurui/.local/share/jixia-demo/storage');
    expect(runbook).toContain('Home -> Projects -> Library -> Reader -> AI Workspace / Notebook -> Project Docs');
    expect(runbook).toContain('Genomics Sandbox');
    expect(runbook).toContain('/home');
    expect(runbook).toContain('Research workbench');
    expect(runbook).toContain('Open tumor board workspace');
    expect(runbook).toContain('Open project library');
    expect(runbook).toContain('Open reader');
    expect(runbook).toContain('Open active notebook');
    expect(runbook).toContain('Open notebook');
    expect(runbook).toContain('Open AI workspace');
    expect(runbook).toContain('Save notebook');
    expect(runbook).toContain('Reader supporting context');
    expect(runbook).toContain('Back to project');
    expect(runbook).toContain('Project Docs');
    expect(runbook).toContain('Open project docs');
    expect(runbook).toContain('Run governed summary');
    expect(runbook).toContain('restart');
    expect(runbook).toContain('Why operator support is next');
    expect(runbook).toContain('Unified Intake & Deep Reading Workbench');
    expect(runbook).toContain('imported inventory');
    expect(runbook).toContain('Insert into project docs');
    expect(runbook).toContain('shared-space');
    expect(runbook).toContain('tumor-board');
    expect(runbook).not.toContain('Create Space -> Library -> Reader -> Writing');
    expect(runbook).not.toContain('Promote latest insight to Writer');
    expect(envExample).toContain(
      'JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-demo/storage',
    );
    expect(envExample).toContain(
      'JIXIA_DATABASE_URL=file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db',
    );
    expect(envExample).toContain('JIXIA_HOST=127.0.0.1');
    expect(envExample).toContain('JIXIA_PORT=3000');
    expect(envExample).not.toContain('YOUR_STORAGE_ROOT');
    expect(envExample).not.toContain('YOUR_DATABASE_URL');
    expect(envExample).not.toContain('YOUR_SERVER_HOST');
    expect(envExample).not.toContain('YOUR_SERVER_PORT');
    expect(readme).toContain('docs/runbooks/native-demo-showcase.md');
    expect(readme).toContain('Research workbench');
    expect(readme).toContain('Unified Intake & Deep Reading Workbench');
    expect(readme).toContain('Discovery & Intake');
    expect(readme).toContain('AI Workspace');
    expect(readme).toContain('Notebook');
    expect(readme).toContain('Project Docs');
    expect(readme).toContain('2026-03-24-jixia-research-workbench-reset-risk-first-implementation.md');
    expect(readme).toContain('Insert into project docs');
    expect(readme).not.toContain('Spaces -> Import paper -> Reader -> Writing -> governed summary');
    expect(readme).not.toContain('It does not yet imply full browser-side live data integration.');
    expect(readme).not.toContain('serves the built Task 10 shell');
    expect(readmeCn).toContain('docs/runbooks/native-demo-showcase.md');
    expect(readmeCn).toContain('统一摄取与深读工作台');
    expect(readmeCn).toContain('Discovery & Intake');
    expect(readmeCn).toContain('AI Workspace');
    expect(readmeCn).toContain('Notebook');
    expect(readmeCn).toContain('Project Docs');
    expect(readmeCn).toContain('2026-03-24-jixia-research-workbench-reset-risk-first-implementation.md');
    expect(readmeCn).toContain('Insert into project docs');
    expect(readmeCn).not.toContain('Spaces -> Import paper -> Reader -> Writing -> governed summary');
    expect(readmeCn).not.toContain('它还不代表浏览器端已经完成全部实时 server-backed 数据接入。');
    expect(readmeCn).not.toContain('托管构建后的 Task 10 Web shell');
  });
});
