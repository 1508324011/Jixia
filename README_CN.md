# 稷下

稷下是一个面向实验室团队的、以服务器为中心的科研协作平台。它计划部署在实验室内网服务器上，由服务端持有权威数据，并围绕项目协作、文献资产、阅读流程、版本化写作与受治理的 AI 作业来组织团队科研工作。当前恢复方向仍然是：**Space 是治理，Project 是协作。**

## 当前阶段

`main` 分支现在承载的是一条集成式 workbench beta，而不再只是占位交互壳。当前分支聚焦于：

1. 面向 spaces、library、reading、writing 与 governed AI jobs 的 server-first 后端骨架
2. 一个 project-first 浏览器工作流壳，会先加载服务端持有的真实 Project，再进入 library、reader 与 writing lane
3. 面向 `Login -> Home -> Today/Search/Library/Projects/Settings` 的集成式 workbench beta
4. 一条可在当前主机上原生跑通、并可跨重启保留 settings、个人导入、paper 注释/评论与 Project Docs 的 beta 路径

bootstrap 护栏仍然保留，但仓库已经不再只是初始化状态。当前目标态产品基线是 `docs/plans/design.md`；较早的 Space-first 计划属于历史 server-first 脚手架说明，除非已经与 project-first recovery plan 对齐，否则不再定义前台产品模型。

## 当前主机 Beta 路径

理解 `main` 上这条集成产品流的最快入口是：

- `docs/runbooks/native-demo-showcase.md`

这份 runbook 记录的是 `main` 上的**当前主机 beta 路径**：原生启动应用、进入 workbench、配置设置、检索 PubMed、导入到 Personal Library、显式把来源采纳到目标 Project Library、打开项目 Reader、持久化 excerpt / 私人笔记 / 项目评论 / insight、显式把 Reader 证据捕获到 actor 私有 Notebook、创建或重新打开 Project Doc、通过选中的 Reader 证据与项目可见 citation/reference 保存共享 Project Doc、检查浏览器安全的 citation trace，并在重启进程后确认状态仍然存在。打包、reset、showcase 这一类能力仍然属于下游 `demo-native-showcase` 分支上的 **demo-only convenience**。

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
- 显式 Reader 证据捕获动作，可把生成的 insight 或 Reader excerpt 送入当前 actor 的私有 Notebook，权限仍由服务端 session 派生
- 项目级 Project Docs 共享知识中心，以及可重新打开的 Project Doc 编辑器路径
- 针对已保存的选中证据、citation、reference 与 source availability 的浏览器安全 Project Doc citation trace 面板；私有 Notebook draft 保持 owner-only
- Project 与 ProjectMember 继续由 Prisma/SQLite 作为权威状态，不依赖旧 JSON project 数组
- 面向 discovery、settings、personal-library import/list、server-owned paper file access、reading detail / mutation、notebook、project-doc 与 workbench 兼容端点的浏览器接口
- 继续保留 legacy `/spaces/...` 路由，用回归测试守住兼容性

面向个人的 `/library` 等路由只是 workbench 层的快捷表达，底层仍然由服务端所有权、scope、权限与审计边界负责。

## 真实运行时说明

- `/login` 是真实的 session 入口页；根路由仍然会先跳到 `/home`，而未登录浏览器会由受保护路由边界再重定向到 `/login?redirect=...`。
- `POST /api/session/login`、`GET /api/session/me` 与 `POST /api/session/logout` 负责管理浏览器使用的服务端 `jixia_session` cookie。
- `POST /api/session/login` 只接受受限的 `{ loginProfileKey }` 选择器来映射预置的实验室 / demo 用户；`userId`、`email`、`actorUserId` 等调用方自带身份字段如果出现在 query 或 body 中，会被拒绝，而不会拿来铸造登录权限。
- `GET /api/home-cockpit` 会从服务端可见的 spaces、projects、personal library entries、notebooks、settings、Project Docs、受治理作业，以及 actor 可见的项目 review/attention 聚合中构建已认证 Home cockpit read model。浏览器 Home 只消费这个传输安全 DTO，而不是本地 dashboard fixture。
- `GET /api/projects/:projectId/workspace` 会返回一个由 ProjectMember 授权的 project workspace read model，其中包含服务端派生的 Project Docs、resources、activity 与 review/attention 区段。其来源是项目级 Project Docs、Library entries、Reader comments/excerpts 与受治理 jobs；响应体不返回私人笔记、原始 job payload、credential secrets、storage keys、checksums 或文件系统路径。
- `GET /api/discovery/today` 与 `GET /api/discovery/search?query=...` 提供当前 discovery 切片。
- `GET /api/settings/me` 与 `POST /api/settings/me` 只通过 Prisma-backed per-user workbench settings 持久化浏览器可见偏好；原始 credential material 只由专用 credential mutation route 接收一次，不会出现在 settings 响应体或 settings 记录中。
- `GET /api/library/personal` 与 `POST /api/library/personal/import` 由服务端托管个人导入归属。
- `POST /api/import/pdf` 是登录用户的论文文件上传入口：服务端把文件字节写入 `JIXIA_STORAGE_ROOT`，计算 checksum，用 checksum 复用全局 file-backed `PaperAsset`，响应体只返回 `asset.hasFile` 这类浏览器安全的可用性字段，不返回 storage key 或 checksum。
- `GET|HEAD /api/library/:entryId/file` 是浏览器唯一的论文文件读取入口。路径参数是带 scope 的 `LibraryEntry.id`，服务端从 `jixia_session` cookie 派生 actor，再按个人 / 项目成员权限授权；浏览器 DTO 不暴露原始 `storageKey`、`papers/...` key、绝对文件路径或 `JIXIA_STORAGE_ROOT`。
- `GET /api/reading/:entryId`、`POST /api/reading/notes`、`POST /api/reading/:entryId/project-comments`、`POST /api/reading/:entryId/insights` 支撑 paper workspace；私人笔记与项目评论走分离的 server-authorized 写入路径。
- `POST /api/reading/:entryId/excerpts` 持久化 Reader excerpt；`POST /api/notebooks/capture` 可以把生成的 insight 或 Reader excerpt 捕获到 actor owner-only Notebook，且不接受浏览器传入的 actor、owner 或 project authority 字段。
- `POST /api/projects/:projectId/library/adoptions` 是显式的项目来源采纳路径。浏览器只发送 `{ sourceLibraryEntryId }`，服务端检查来源可读性与目标项目 owner/editor 成员资格后，才创建或复用 project-scoped `LibraryEntry`。首次成功采纳会在同一个事务中创建目标 `LibraryEntry` 与经过脱敏的 `project_library.source_adopted` governance audit 记录；重复、拒绝或被拦截的采纳请求不会产生重复的采纳 audit。
- `POST /api/project-docs/:documentId/notebook-adoptions` 仅保留为 legacy/internal 兼容端点。前台 Project Docs 通过选中的 Reader 证据、项目可见 citation/reference 与显式 Project Library source adoption 建立共享知识，而不是提供整本私有 Notebook 的转移入口。
- `GET /api/project-docs/:documentId/citation-trace` 返回 ProjectMember-gated、浏览器安全的最新 Project Doc citation trace，包括 source availability / adoption-needed 状态，但不包含 storage keys、checksums、私有 Notebook 正文、Reader 私人笔记、credential refs 或 actor authority 字段。
- `GET /api/projects/:projectId/writing-document` 让兼容调用方重新打开最新可见的共享 Project Doc；如果项目尚无共享 Project Doc，服务端会真实返回空状态。
- `GET /api/project-docs/:documentId` 返回最新 Project Doc snapshot；如果文档存在但尚未保存版本，服务端返回 `versionNumber: 0` 的空 snapshot，而不是浏览器生成的 fallback 内容。
- `GET /api/projects/:projectId/writing/document` 与 `POST /api/projects/:projectId/writing/document` 是由 Project Docs 支撑的 project-first workbench 兼容端点；Project Docs 是项目共享知识中心的权威运行时。
- `GET /api/writing/:spaceId/projects/:projectId/document` 与 `POST /api/writing/:spaceId/projects/:projectId/document` 只保留为 legacy deep link 的兼容 workbench 端点；Project Docs 仍然是项目写作的权威运行时。

## 验证快照

当前分支的标准验证仍然以以下命令为准：

- `npm test`
- `npm run typecheck`
- `npm run build`

额外的定向验证还覆盖 workbench 路由与导航、personal / project 上下文切换、discovery/search 到 Personal Library 的导入路径、paper workspace 持久化、Reader evidence 捕获到私有 Notebook、选中证据进入 Project Doc draft/reopen、前台没有整本 Notebook 进入 Project Docs 的 affordance、当前主机 beta runbook 的真实性，以及 server-first Prisma-backed project membership。

## 近期方向

下一阶段的交付重点分为三条：

1. 继续推进 Task 11 的运维 / 部署路径，保证运行时在实验室服务器上的可重复启动
2. 继续把仍然偏 shell-like 的细节替换为权威的 server-backed 行为，同时保持 server-first 模型
3. 把下游 `demo-native-showcase` 分支继续限制在 demo / operator packaging 范围内，而不是产品模型分叉

`docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md` 中记录了当前已交付的内容、仍然有 shell 感的边界，以及下一阶段 handoff 的重点。

## Task 11 运维启动手册

Task 11 的目标是把已经验证过的 Web 交互层收敛成一个可重复启动的实验室服务器包。当前运行时会启动一个 Node 22 HTTP 服务，托管构建后的浏览器应用，暴露 `/health` 与 API 范围内的 `/api/health` mirror，并把上传论文文件与本地密钥材料持久化到配置存储根目录下，同时由 Prisma/SQLite 支撑项目协作、provider credential secrets 与 workbench settings。这是 Prisma-backed Project 协作数据 的实验室服务器路径。

### 前置条件

- Node.js 22
- 与仓库锁文件匹配的 npm
- 只有需要可选打包验证路径时，才需要安装 Docker 与 Docker Compose

### 环境变量约定

先将 `.env.example` 复制为 `.env`，再填写 operator 对应的值。

- `JIXIA_STORAGE_ROOT` 用来控制 Jixia 的服务端持久化存储目录。在实验室服务器上，建议使用 `/var/lib/jixia/storage` 这样的持久盘路径。
- 上传的论文文件同样保存在这个 storage root 下，且只使用服务端校验过的相对 key；Reader 只能通过 `GET|HEAD /api/library/:entryId/file` 访问这些文件。实验室服务器需要把该目录与 SQLite 数据库一起持久化，才能保证重启后文件字节与 `PaperAsset` metadata 仍然一致。
- 正常协作运行时的权威数据来自 Prisma/SQLite，而不是 `JIXIA_STORAGE_ROOT/server-state.json`。全新部署可以在没有该文件的情况下启动；剩余 legacy JSON 处理仅作为显式的一次性兼容 bootstrap 路径，而不是正常运行时持久化。
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

启动后，服务会从 `dist/` 提供构建后的 workbench shell，响应 `/health` 与 `/api/health`，并在 `/api/` 下暴露当前 beta 需要的浏览器接口。

推荐把 `http://127.0.0.1:3000/health` 作为第一步运行时自检；检查浏览器/API handoff 时再验证 API 范围内的 mirror：`http://127.0.0.1:3000/api/health`。健康的 Task 11 进程会在两个端点都返回 `{"service":"jixia-server","status":"ok"}`。

### 可选 Docker Compose 打包路径

只有在当前主机具备 Docker 能力、需要验证打包形态时才使用此路径。当前主机必需的 gate 是上面的本地 Node 启动路径。

```bash
cp .env.example .env
docker compose up --build
```

仓库内置的 `docker-compose.yml` 会映射运行端口，把 `JIXIA_STORAGE_ROOT` 固定到挂载后的 `/var/lib/jixia/storage`，并把 `JIXIA_DATABASE_URL` 指向挂载后的 `/var/lib/jixia/data`，用于 Prisma-backed Project 协作数据，同时把 credential encryption key material 放在同一个持久 storage root 下。正常启动不要求预先存在 `/var/lib/jixia/storage/server-state.json`。

Docker 镜像也把同一个 `/health` 运行时约定编码为容器 health check，因此 `docker compose ps` 看到的健康状态代表的是应用已经真正可响应，而不只是 Node 进程被拉起。
