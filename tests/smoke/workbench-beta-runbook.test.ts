import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const RUNBOOK_PATH = 'docs/runbooks/native-demo-showcase.md';
const README_PATH = 'README.md';
const README_CN_PATH = 'README_CN.md';

function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('workbench beta runbook contract', () => {
  it('documents the truthful current-host beta flow and separates demo-only convenience', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };
    const runbook = existsSync(RUNBOOK_PATH) ? read(RUNBOOK_PATH) : '';
    const readme = read(README_PATH);
    const readmeCn = read(README_CN_PATH);

    expect(packageJson.scripts?.['start:server']).toBeTruthy();
    expect(existsSync(RUNBOOK_PATH)).toBe(true);

    expect(runbook).toContain('current host');
    expect(runbook).toContain('no-Docker');
    expect(runbook).toContain('npm install');
    expect(runbook).toContain('npm run build');
    expect(runbook).toContain('npm run start:server');
    expect(runbook).toContain('http://127.0.0.1:3000');
    expect(runbook).toContain('登录');
    expect(runbook).toContain('个人工作台');
    expect(runbook).toContain('设置');
    expect(runbook).toContain('API key not configured');
    expect(runbook).toContain('Search intake boards');
    expect(runbook).toContain('导入到个人 Library');
    expect(runbook).toContain('Open reader');
    expect(runbook).toContain('Save private note');
    expect(runbook).toContain('Open notes workspace');
    expect(runbook).toContain('Open project docs');
    expect(runbook).toContain('restart the app process');
    expect(runbook).toContain('server-state.json');
    expect(runbook).toContain('demo-native-showcase');
    expect(runbook).toContain('demo-only convenience');
    expect(runbook).toContain('Unified Intake & Deep Reading Workbench');
    expect(runbook).toContain('Discovery & Intake');
    expect(runbook).toContain('Pull lane');
    expect(runbook).toContain('Push lane');
    expect(runbook).toContain('imported inventory');
    expect(runbook).toContain('Notebook');
    expect(runbook).toContain('fully private');
    expect(runbook).toContain('Project Docs');
    expect(runbook).toContain('Insert into project docs');
    expect(runbook).not.toContain('Promote latest insight to Writer');
    expect(runbook).not.toContain('打开 Writer 文稿');

    expect(readme).toContain('docs/runbooks/native-demo-showcase.md');
    expect(readme).toContain('current-host beta path');
    expect(readme).toContain('demo-native-showcase');
    expect(readme).toContain('Unified Intake & Deep Reading Workbench');
    expect(readme).toContain('Discovery & Intake');
    expect(readme).toContain('Project Docs');
    expect(readme).toContain('Insert into project docs');
    expect(readme).toContain('/projects/:projectId/...');
    expect(readmeCn).toContain('docs/runbooks/native-demo-showcase.md');
    expect(readmeCn).toContain('当前主机 beta 路径');
    expect(readmeCn).toContain('demo-native-showcase');
    expect(readmeCn).toContain('统一摄取与深读工作台');
    expect(readmeCn).toContain('Discovery & Intake');
    expect(readmeCn).toContain('Project Docs');
    expect(readmeCn).toContain('Insert into project docs');
    expect(readmeCn).toContain('/projects/:projectId/...');
  });
});
