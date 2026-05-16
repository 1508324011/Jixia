# 稷下

稷下是一个面向实验室团队的、以服务器为中心的科研协作平台。它计划部署在实验室内网服务器上，由服务端持有权威数据，并围绕项目协作、文献资产、阅读流程、版本化写作与受治理的 AI 作业来组织团队科研工作。当前恢复方向仍然是：**Space 是治理，Project 是协作。**

## 当前阶段

`main` 分支现在承载的是一条集成式 workbench beta，而不再只是占位交互壳。当前分支聚焦于：

1. 面向 spaces、library、reading、writing 与 governed AI jobs 的 server-first 后端骨架
2. 一个 project-first 浏览器工作流壳，会先加载服务端持有的真实 Project，再进入 library、reader 与 writing lane
3. 面向 `Login -> Home -> Today/Search/Library/Projects/Settings` 的集成式 workbench beta
4. 一条可在当前主机上原生跑通、并可跨重启保留 settings、个人导入、paper 注释/评论与 Writer 草稿的 beta 路径

bootstrap 护栏仍然保留，但仓库已经不再只是初始化状态。当前目标态产品基线是 `docs/plans/design.md`；较早的 Space-first 计划属于历史 server-first 脚手架说明，除非已经与 project-first recovery plan 对齐，否则不再定义前台产品模型。

## 当前主机 Beta 路径

理解 `main` 上这条集成产品流的最快入口是：

- `docs/runbooks/native-demo-showcase.md`

这份 runbook 记录的是 `main` 上的**当前主机 beta 路径**：原生启动应用、进入 workbench、配置设置、检索 PubMed、导入到 Personal Library、打开 Reader、持久化私人笔记 / 项目评论 / insight、推进到 Writer、重新打开 Writer 草稿，并在重启进程后确认状态仍然存在。打包、reset、showcase 这一类能力仍然属于下游 `demo-native-showcase` 分支上的 **demo-only convenience**。

## 计划文档

详细设计与实施计划位于 `docs/plans/`：

- `design.md` — 当前目标态产品基线
- `2026-05-03-jixia-project-first-recovery-plan.md` — 当前 project-first recovery plan
- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`
- `2026-03-22-jixia-task-11-deployment-implementation.md`
- `2026-03-23-jixia-web-interaction-design.md`
- `2026-03-23-jixia-web-interaction-implementation.md`

## 集成式 Workbench Beta 展示面

当前 `main` 上已经交付的产品面包括：

- `src/web/app.tsx` 与 `src/web/router.tsx`
- `src/web/pages/login-page.tsx` 与 `src/web/pages/home-page.tsx`，对应 `登录` 与 `个人工作台首页`
- `今日推荐`、`搜索`、`Library`、`Projects`、`设置` 五个顶层入口
- 明确的 `Personal` 与 `Project / 项目名` 上下文提示
- `AI 对话`、`私人笔记`、`共享评论`、`关键信息` 四个 paper workspace 面板
- 项目级 `Writer 文档区` 以及可重新打开的 Writer 草稿预览
- Project 与 ProjectMember 继续由 Prisma/SQLite 作为权威状态，不依赖旧 JSON project 数组
- 面向 discovery、settings、personal-library import/list、reading detail / mutation、notebook、project-doc 与 workbench 兼容端点的浏览器接口
- 继续保留 legacy `/spaces/...` 路由，用回归测试守住兼容性

面向个人的 `/library` 等路由只是 workbench 层的快捷表达，底层仍然由服务端所有权、scope、权限与审计边界负责。

## 真实运行时说明

- `/login` 是真实的 session 入口页；根路由仍然会先跳到 `/home`，而未登录浏览器会由受保护路由边界再重定向到 `/login?redirect=...`。
- `POST /api/session/login`、`GET /api/session/me` 与 `POST /api/session/logout` 负责管理浏览器使用的服务端 `jixia_session` cookie。
- `POST /api/session/login` 只接受受限的 `{ loginProfileKey }` 选择器来映射预置的实验室 / demo 用户；`userId`、`email`、`actorUserId` 等调用方自带身份字段如果出现在 query 或 body 中，会被拒绝，而不会拿来铸造登录权限。
- `GET /api/discovery/today` 与 `GET /api/discovery/search?query=...` 提供当前 discovery 切片。
- `GET /api/settings/me` 与 `POST /api/settings/me` 会通过 Prisma-backed per-user workbench settings 与加密后的 provider credential secret 行持久化浏览器可见的 settings 状态，同时不把原始 API key 暴露到响应体或 settings 记录中。
- `GET /api/library/personal` 与 `POST /api/library/personal/import` 由服务端托管个人导入归属。
- `GET /api/reading/:entryId`、`POST /api/reading/notes`、`POST /api/reading/:entryId/project-comments`、`POST /api/reading/:entryId/insights` 支撑 paper workspace；私人笔记与项目评论走分离的 server-authorized 写入路径。
- `GET /api/projects/:projectId/writing/document` 与 `POST /api/projects/:projectId/writing/document` 是 project-first workbench 主流程下的 canonical 浏览器 Writer 端点。
- `GET /api/writing/:spaceId/projects/:projectId/document` 与 `POST /api/writing/:spaceId/projects/:projectId/document` 只保留为 legacy deep link 的兼容 workbench 端点；Project Docs 仍然是项目写作的权威运行时。

## 验证快照

当前分支的标准验证仍然以以下命令为准：

- `npm test`
- `npm run typecheck`
- `npm run build`

额外的定向验证还覆盖 workbench 路由与导航、personal / project 上下文切换、discovery/search 到 Personal Library 的导入路径、paper workspace 持久化与 Writer promotion/reopen、当前主机 beta runbook 的真实性，以及 server-first Prisma-backed project membership。

## 近期方向

下一阶段的交付重点分为三条：

1. 继续推进 Task 11 的运维 / 部署路径，保证运行时在实验室服务器上的可重复启动
2. 继续把仍然偏 shell-like 的细节替换为权威的 server-backed 行为，同时保持 server-first 模型
3. 把下游 `demo-native-showcase` 分支继续限制在 demo / operator packaging 范围内，而不是产品模型分叉

`docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md` 中记录了当前已交付的内容、仍然有 shell 感的边界，以及下一阶段 handoff 的重点。

## Task 11 运维启动手册

Task 11 的目标是把已经验证过的 Web 交互层收敛成一个可重复启动的实验室服务器包。当前运行时会启动一个 Node 22 HTTP 服务，托管构建后的浏览器应用，暴露 `/health`，并把服务端状态持久化到配置存储根目录下，同时由 Prisma/SQLite 支撑项目协作、provider credential secrets 与 workbench settings。这是 Prisma-backed Project 协作数据 的实验室服务器路径。

### 前置条件

- Node.js 22
- 与仓库锁文件匹配的 npm
- 如需容器化路径，则安装 Docker 与 Docker Compose

### 环境变量约定

先将 `.env.example` 复制为 `.env`，再填写 operator 对应的值。

- `JIXIA_STORAGE_ROOT` 用来控制 Jixia 的服务端持久化存储目录。在实验室服务器上，建议使用 `/var/lib/jixia/storage` 这样的持久盘路径。
- 当前运行时仍会把旧的非 Prisma beta 状态保存在 `JIXIA_STORAGE_ROOT/server-state.json`，但新的 credential secret material 与 workbench settings 不再写入这里。
- `JIXIA_DATABASE_URL` 控制 Prisma-backed `Space`、`Project`、`ProjectMember`、library、notebook、Project Doc、provider credential secret 与 workbench settings 权威数据使用的 SQLite 数据库。建议放在 `file:/var/lib/jixia/data/jixia.db` 这样的持久路径。
- `JIXIA_STORAGE_ROOT/credentials.key` 是 provider credential secret 的本地加密权威。可跨重启使用的加密凭据同时需要持久 SQLite 数据库与这个持久 key 文件；如果 key 丢失或被替换，已有 credential rows 会 fail closed，而不会静默重建或暴露明文。
- `JIXIA_HOST` 控制绑定地址。本地仅自用时可使用 `127.0.0.1`；在 Docker 或需要对实验室网络提供服务时使用 `0.0.0.0`。
- `JIXIA_PORT` 控制 HTTP 监听端口。Task 11 的默认端口为 `3000`。

实验室服务器需要同时持久化 `/var/lib/jixia/storage` 与 `/var/lib/jixia/data`，并把 `credentials.key` 纳入 storage root 的备份计划。

### 本地 Node 启动路径

```bash
cp .env.example .env
npm install
npm run build
npm run start:server
```

启动后，服务会从 `dist/` 提供构建后的 workbench shell，响应 `/health`，并在 `/api/` 下暴露当前 beta 需要的浏览器接口。

推荐把 `http://127.0.0.1:3000/health` 作为第一步运行时自检；健康的 Task 11 进程会返回 `{"service":"jixia-server","status":"ok"}`。

### Docker Compose 启动路径

```bash
cp .env.example .env
docker compose up --build
```

仓库内置的 `docker-compose.yml` 会映射运行端口，把 `JIXIA_STORAGE_ROOT` 固定到挂载后的 `/var/lib/jixia/storage`，并把 `JIXIA_DATABASE_URL` 指向挂载后的 `/var/lib/jixia/data`，用于 Prisma-backed Project 协作数据，同时继续将 legacy beta 状态文件持久化到 `/var/lib/jixia/storage/server-state.json`，并把 credential encryption key material 放在同一个持久 storage root 下。

Docker 镜像也把同一个 `/health` 运行时约定编码为容器 health check，因此 `docker compose ps` 看到的健康状态代表的是应用已经真正可响应，而不只是 Node 进程被拉起。
