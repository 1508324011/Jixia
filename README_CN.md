# 稷下

稷下是一个面向实验室团队的、以服务器为中心的科研协作平台。
它计划部署在实验室内网服务器上，由服务端持有权威数据，并围绕空间、文献资产、阅读流程、版本化写作与受治理的 AI 作业来组织团队科研工作。

## 当前阶段

当前仓库已经具备 server-first 后端骨架、来自 `main` 的最终 workbench beta，以及一条可直接在 Node 上跑通真实浏览器工作流的原生 Demo 展示路径。

当前分支聚焦于：

1. 面向 spaces、library、reading、writing 与 governed AI jobs 的 server-first 后端骨架
2. 面向 `Login -> Home -> Today/Search/Library/Projects/Settings` 的集成式 workbench beta
3. 面向 `Spaces -> Import paper -> Reader -> Writing -> governed summary` 的原生 Node Demo，且支持确定性 reset 与打包运行

bootstrap 护栏仍然保留，但当前分支已经不再只是仓库初始化或占位 UI。现在的状态是一个经过验证的 workbench 交互模型，同时也能通过真实 server-backed 的 native showcase 跑通主线流程。

## Native Demo 展示手册

理解当前可运行 demo 的最快入口仍然是：

- `docs/runbooks/native-demo-showcase.md`

该 runbook 记录了精确的 reset / startup 命令、`npm run package:native-demo` 生成的打包产物路径，以及包含 `Import paper`、reader 持久化、writing reopen、publish 与 governed summary 收尾的真实浏览器走查路径。

## 当前主机产品真实路径

这个下游分支已经继承了 `main` 上最终的产品能力：settings 持久化、PubMed discovery/import、personal Library、paper workspace 持久化，以及 Writer 跨重启 reopen。这里额外保留的是 demo-only convenience：确定性 reset、packaged runtime handoff，以及面向 reviewer 的 `/spaces/...` guided showcase。

这也是 `demo-native-showcase` 继承来的**当前主机 beta 路径**语境，而 `docs/runbooks/native-demo-showcase.md` 继续承担 reviewer 使用的 native demo walkthrough。

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

## 当前集成展示面

当前 Web 层已经把最终 workbench 产品模型与可运行的 native demo 展示面收敛到一起。

当前已交付内容包括：

- `src/web/app.tsx` 与 `src/web/router.tsx`
- `src/web/pages/login-page.tsx` 与 `src/web/pages/home-page.tsx`，对应 `登录` 与 `个人工作台首页`
- `今日推荐`、`搜索`、`Library`、`Projects`、`设置` 五个顶层入口
- 明确的 `Personal` 与 `Project / 项目名` 上下文提示
- `AI 对话`、`私人笔记`、`共享评论`、`关键信息` 四个 paper workspace 面板
- 项目级 `Writer 文档区` 以及可重新打开的 Writer 草稿预览
- 由 native HTTP server 驱动的 spaces、library、reader、writing 真实页面
- 面向 discovery、settings、personal-library import/list、reading detail / mutation、writing reopen / save 的权威 workbench 接口
- 继续保留 legacy `/spaces/...` 路由，用回归测试守住兼容性

面向个人的 `/library` 等路由只是 workbench 层的快捷表达，底层仍然由同一个 `space` 模型负责路由、合同、权限与审计边界。

## 真实运行时说明

- `/login` 仍然只是一个 shell 级入口页；workbench 浏览器流从 `/home` 开始
- `GET /api/discovery/today` 与 `GET /api/discovery/search?query=...` 提供 discovery 切片
- `GET /api/settings/me` 与 `POST /api/settings/me` 会持久化浏览器可见的 settings 状态，同时不把原始 API key 暴露到响应体
- `GET /api/library/personal` 与 `POST /api/library/personal/import` 由服务端托管个人导入归属
- `GET /api/reading/:entryId`、`POST /api/reading/:entryId/notes`、`POST /api/reading/:entryId/insights` 支撑 paper workspace
- `GET /api/writing/:spaceId/projects/:projectId/document` 与 `POST /api/writing/:spaceId/projects/:projectId/document` 支撑 Writer reopen/save
- 原生 demo 仍然额外保留 deterministic `/api/spaces`、publish 与 governed-summary walkthrough 步骤

## 验证快照

当前分支的标准验证仍然以以下命令为准：

- `npm test`
- `npm run typecheck`
- `npm run build`

额外的定向验证还覆盖 workbench 路由、personal / project 上下文切换、paper workspace 持久化、项目写作流、native walkthrough、packaged demo 文档，以及 governed-summary finale。

## 近期方向

下一阶段的交付重点分为三条：

1. 继续推进 Task 11 的运维 / 部署路径，保证运行时在实验室服务器上的可重复启动
2. 继续把仍然偏 shell-like 的细节替换为权威的 server-backed 行为，同时保持 server-first 模型
3. 继续让 `demo-native-showcase` 保持 downstream-only，避免 demo / operator packaging 再次分叉产品模型

`docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md` 中记录了当前已交付的内容、仍然有 shell 感的边界，以及下一阶段 handoff 的重点。

## Task 11 运维启动手册

Task 11 的目标是把已经验证过的 web 交互层收敛成一个可重复启动的实验室服务器包。当前运行时会启动一个最小 Node 22 HTTP 服务，托管构建后的浏览器应用、持久化 `server-state.json`，并保留 demo 打包交付路径。

### 前置条件

- Node.js 22
- 与仓库锁文件匹配的 npm
- 如需容器化路径，则安装 Docker 与 Docker Compose

### 环境变量约定

先将 `.env.example` 复制为 `.env`，即可在当前主机上直接使用可运行的 native demo 默认值；如果你的 operator 路径不同，再按需修改。

- `JIXIA_STORAGE_ROOT` 用来控制 Jixia 的服务端持久化存储目录。当前示例默认使用 `/home/zhurui/.local/share/jixia-demo/storage`。
- 当前运行时会把服务端状态持久化到 `JIXIA_STORAGE_ROOT/server-state.json`。
- `JIXIA_DATABASE_URL` 目前仍是面向下一阶段 DB-backed 运行时的保留运行时边界。当前示例默认使用 `file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db`。
- `JIXIA_HOST` 控制绑定地址。本地仅自用时可使用 `127.0.0.1`；在 Docker 或需要对实验室网络提供服务时使用 `0.0.0.0`。
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

如果你想先把同一个 demo 产出成不依赖源码树的可运行包，可以先生成打包 bundle：

```bash
npm run package:native-demo
cd .native-demo-package/native-demo
node demo-reset.mjs
./run-native-demo.sh
```

启动后，服务会从 `dist/` 提供构建后的 workbench shell，响应 `/health`，并在 `/api/` 提供当前 server-backed 的浏览器接口。浏览器走查既可以从 `Login -> Home` 进入，也可以按 native demo 的路径执行：`Create space` -> `Open library` -> `Import paper` -> `Open reader` -> `Refresh reader` -> `Open writing` -> `Reload draft` -> `Publish` -> 可选的 `Run governed summary`。

### Docker Compose 启动路径

```bash
cp .env.example .env
docker compose up --build
```

仓库内置的 `docker-compose.yml` 会映射运行端口，把 `JIXIA_STORAGE_ROOT` 固定到挂载后的 `/var/lib/jixia/storage`，把 `JIXIA_DATABASE_URL` 固定到挂载后的 `/var/lib/jixia/data` 作为后续 DB-backed 运行时的保留运行时边界，并将 Task 11 的状态文件持久化到 `/var/lib/jixia/storage/server-state.json`。容器启动时运行的是 `.native-demo-package/native-demo` 中的打包 native demo，而不是直接从源码树启动。
