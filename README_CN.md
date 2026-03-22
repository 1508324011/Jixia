# 稷下

稷下是一个面向实验室团队的、以服务器为中心的科研协作平台。
它计划部署在实验室内网服务器上，由服务端持有权威数据，并围绕空间、文献资产、阅读流程、
版本化写作与受治理的 AI 作业来组织团队科研工作。

## 当前阶段

当前仓库已经具备 server-first 后端骨架，以及一条对齐的原生 Demo 展示路径，可直接在 Node 上跑通真实的浏览器工作流。

当前分支聚焦于：

1. 面向 spaces、library、reading、writing 与 governed AI jobs 的 server-first 后端骨架
2. 面向 `Spaces -> Import Paper -> Reader -> Writing -> governed summary` 的原生 Node Demo，且支持确定性 reset

bootstrap 护栏仍然保留，但当前分支已经不再只是 Task 10 的占位 UI 壳。
现在的状态是一个经过验证的 native showcase，而不是静态页面 handoff。

## Native Demo 展示手册

理解当前分支的最快入口是专门的 runbook：

- `docs/runbooks/native-demo-showcase.md`

该 runbook 记录了精确的 reset / startup 命令、用户自有运行路径，以及浏览器中的真实点击链路，包括 `Enter shared space`、`Import paper`、`Open reader`、`Refresh reader`、`Open writing`、`Reload draft`、`Publish`，以及可选的 `Run governed summary` 收尾步骤。

## 计划文档

详细设计与实施计划位于 `docs/plans/`：

- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`
- `2026-03-22-jixia-task-11-deployment-implementation.md`

## 当前展示面

当前 Web 层包括：

- `src/web/app.tsx` 与 `src/web/router.tsx`
- 由 native HTTP server 驱动的 spaces、library、reader、writing 四个真实页面
- 最小设计 token 与共享页面样式
- visibility、shared context、publish state、governed AI/job 等治理信号
- 覆盖主导航链路、direct deep link、刷新后仍可见的持久化验证，以及 governed-job finale 的 UI 测试

## 验证快照

当前分支最近一次验证结果：

- `npm run typecheck`
- `npm test`
- `npm run build`

这意味着当前分支已适合做 native demo 走查与 operator 视角的评审，
但它仍然是一个收敛后的 showcase，而不是完整的生产部署方案。

## 近期方向

下一阶段的重点是 operator hardening：把当前 native demo 的运行合同继续推进为更可控的部署路径，包括服务托管、持久化目录归属、密钥注入、备份与可重复运维包装。

## Task 11 运维启动手册

Task 11 现在的目标，是把当前 native showcase 收敛成一条可重复启动的实验室服务器路径。
当前运行时会启动一个最小 Node 22 HTTP 服务，托管构建后的浏览器应用与 native demo JSON API，并暴露 `GET /health` 供运维检查。

### 前置条件

- Node.js 22
- 与仓库锁文件匹配的 npm
- 如需容器化路径，则安装 Docker 与 Docker Compose

### 环境变量约定

先将 `.env.example` 复制为 `.env`，即可在当前主机上直接使用可运行的 native demo 默认值；如果你的 operator 路径不同，再按需修改。

- `JIXIA_STORAGE_ROOT` 用来控制 Jixia 的服务端持久化存储目录。
  当前示例默认使用 `/home/zhurui/.local/share/jixia-demo/storage`。
- 当前 Task 11 运行时实际会把服务端状态持久化到
  `JIXIA_STORAGE_ROOT/server-state.json`。
- `JIXIA_DATABASE_URL` 目前仍是面向下一阶段 DB-backed 运行时的保留运行时边界。
  当前示例默认使用 `file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db`。
- `JIXIA_HOST` 控制绑定地址。本地仅自用时可使用 `127.0.0.1`；
  在 Docker 或需要对实验室网络提供服务时使用 `0.0.0.0`。
- `JIXIA_PORT` 控制 HTTP 监听端口。Task 11 的默认端口为 `3000`。

当要交给 operator 长期托管时，再把这些默认路径迁移到实验室自己的持久化目录。

### 本地 Node 启动路径

```bash
cp .env.example .env
npm install
npm run build
npm run demo:reset
npm run start:server
```

启动后，服务会从 `dist/` 提供构建后的浏览器应用、native demo API，并在 `/health` 暴露健康检查端点。浏览器走查路径现在是 `Enter shared space` -> `Import paper` -> `Open reader` -> `Refresh reader` -> `Open writing` -> `Reload draft` -> `Publish` -> 可选的 `Run governed summary`。

### Docker Compose 启动路径

```bash
cp .env.example .env
docker compose up --build
```

仓库内置的 `docker-compose.yml` 会映射运行端口，把 `JIXIA_STORAGE_ROOT`
固定到挂载后的 `/var/lib/jixia/storage`，把 `JIXIA_DATABASE_URL` 固定到挂载后的
`/var/lib/jixia/data` 以保留后续兼容性，并将 Task 11 的状态文件持久化到
`/var/lib/jixia/storage/server-state.json`。
