# 稷下

稷下是一个面向实验室团队的、以服务器为中心的科研协作平台。
它计划部署在实验室内网服务器上，由服务端持有权威数据，并围绕空间、文献资产、阅读流程、
版本化写作与受治理的 AI 作业来组织团队科研工作。

## 当前阶段

当前仓库已经具备两层对齐的基础：

1. 面向 spaces、library、reading、writing 与 governed AI jobs 的 server-first 后端骨架
2. 面向 `Login -> Home -> Today/Search/Library/Projects/Settings` 的 workbench-first Web 交互壳

bootstrap 护栏仍然保留，但项目已经不再只是仓库初始化状态。
当前分支反映的是一个经过验证的 workbench 交互壳，而不是占位用的 Web 入口或单一路径演示。

## 计划文档

详细设计与实施计划位于 `docs/plans/`：

- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`
- `2026-03-22-jixia-task-11-deployment-implementation.md`
- `2026-03-23-jixia-web-interaction-design.md`
- `2026-03-23-jixia-web-interaction-implementation.md`

## Workbench 交互壳状态

当前 Web 层已经从单一路径的 `Spaces -> Library -> Reader -> Writing` 演示，
扩展为以个人工作台为起点的 workbench 交互壳。

当前已交付内容包括：

- `src/web/app.tsx` 与 `src/web/router.tsx`
- `src/web/pages/login-page.tsx`
- `src/web/pages/home-page.tsx`，即 `个人工作台首页`
- `今日推荐`、`搜索`、`Library`、`Projects`、`设置` 五个顶层入口
- 明确的 `Personal` 与 `Project / 项目名` 上下文提示
- `AI 对话`、`私人笔记`、`共享评论`、`关键信息` 四个 paper workspace 面板
- 将成熟内容推进到 `Writer 文档区` 的项目级写作流提示
- `GET /api/discovery/today` 与 `GET /api/settings/me` 两个 workbench shell HTTP 合同端点
- 继续保留 legacy `/spaces/...` 路由，用回归测试守住兼容性

面向个人的 `/library` 等路由只是 workbench 层的快捷表达，底层仍然由同一个
`space` 模型负责路由、合同、权限与审计边界。

## 验证快照

当前分支的标准验证仍然以以下命令为准：

- `npm test`
- `npm run typecheck`
- `npm run build`

在本次 workbench 交互实现过程中，额外的定向验证还覆盖：

- workbench 路由与导航
- personal / project 上下文切换
- paper workspace 面板与 Writer 交接提示
- discovery / settings HTTP 合同

## 近期方向

下一阶段的交付重点分为三条：

1. 继续推进 Task 11 的运维 / 部署路径，保证实验室服务器上的可重复启动
2. 把新的 workbench 页面从 demo 数据逐步替换为权威的 server-backed 数据
3. 把 paper、project 与 Writer 的当前壳交互扩展为真正持久化的协作流程

`docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md` 中记录了
当前已交付的 workbench 壳、仍然存在的 shell 边界，以及下一阶段的 handoff。

## Task 11 运维启动手册

Task 11 的目标是把已经验证过的 workbench 交互壳收敛成一个可重复启动的实验室服务器包。
当前运行时会启动一个最小 Node 22 HTTP 服务、托管构建后的 workbench shell，
并暴露 `GET /health`、`GET /api/discovery/today`、`GET /api/settings/me`。
这些 `/api/` 端点目前仍然是 shell 合同，而不是完整业务产品端点。

### 前置条件

- Node.js 22
- 与仓库锁文件匹配的 npm
- 如需容器化路径，则安装 Docker 与 Docker Compose

### 环境变量约定

先将 `.env.example` 复制为 `.env`，再填写实验室服务器的实际值。

- `JIXIA_STORAGE_ROOT` 用来控制 Jixia 的服务端持久化存储目录。
  实验室服务器建议使用 `/var/lib/jixia/storage` 这样的持久盘路径。
- 当前 Task 11 运行时实际会把服务端状态持久化到
  `JIXIA_STORAGE_ROOT/server-state.json`。
- `JIXIA_DATABASE_URL` 目前仍是面向下一阶段 DB-backed 运行时的保留的运行时边界。
  为了保持后续兼容，建议继续使用 `file:/var/lib/jixia/data/jixia.db`。
- `JIXIA_HOST` 控制绑定地址。本地仅自用时可使用 `127.0.0.1`；
  在 Docker 或需要对实验室网络提供服务时使用 `0.0.0.0`。
- `JIXIA_PORT` 控制 HTTP 监听端口。Task 11 的默认端口为 `3000`。

实验室服务器至少需要持久化 `/var/lib/jixia/storage`，确保 `server-state.json`
在重启后仍然存在。`/var/lib/jixia/data` 则继续保留给下一阶段的数据库运行时，
这样未来接入真实 DB 时无需改变 operator 合同。

### 本地 Node 启动路径

```bash
cp .env.example .env
npm install
npm run build
npm run start:server
```

启动后，服务会从 `dist/` 提供构建后的 workbench shell，响应 `/health`，
并在 `/api/` 暴露当前 shell 合同端点。

### Docker Compose 启动路径

```bash
cp .env.example .env
docker compose up --build
```

仓库内置的 `docker-compose.yml` 会映射运行端口，把 `JIXIA_STORAGE_ROOT`
固定到挂载后的 `/var/lib/jixia/storage`，把 `JIXIA_DATABASE_URL` 固定到挂载后的
`/var/lib/jixia/data` 以保留后续兼容性，并将 Task 11 的状态文件持久化到
`/var/lib/jixia/storage/server-state.json`。
