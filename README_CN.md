# 稷下

稷下是一个面向实验室团队的、以服务器为中心的科研协作平台。
它计划部署在实验室内网服务器上，由服务端持有权威数据，并围绕空间、文献资产、阅读流程、版本化写作与受治理的 AI 作业来组织团队科研工作。

## 当前阶段

这个分支现在把三件事收敛到了同一个可运行 worktree 中：

1. 面向 spaces、library、reading、notebook documents、writing 与 governed AI jobs 的 server-first 后端骨架
2. 已经过验证的 workbench 浏览器界面：`Home -> Projects -> Search/Library -> Reader -> AI Workspace / Notebook -> Project Docs`
3. 已经落地到 `demo-native-showcase` 的 **统一摄取与深读工作台** reset：canonical `/projects/...` 路由、三栏 shell、dense feeder surfaces、全局 `AI Workspace`、私有且 document-first 的 `Notebook`、document-first 的 `Reader`，以及 project-owned 文档语义

也就是说，这个分支不再只是“有一个 approved reset 计划”。风险优先实现计划的 Tasks 1–9 已经在 `demo-native-showcase` 中落地并完成验证；当前面向后续迭代的重点，是 operator handoff / packaging，以及更完整的 recommendation / push-lane 能力。

## Native Demo 展示手册

理解当前可运行 demo 的最快入口仍然是：

- `docs/runbooks/native-demo-showcase.md`

该 runbook 记录了精确的 reset / startup 命令、`npm run package:native-demo` 生成的打包产物路径、当前真实的浏览器走查路径，以及已交付 reset 与后续 recommendation / operator 工作之间的边界。

## 当前主机 beta 路径真相

这个下游分支继承了 `main` 的 current-host beta path，但“产品真相”已经前进：

- 浏览器主入口是 `/home`
- 主 shell 是三栏 `Research workbench`
- 稠密的 `Search intake boards` 与 `Library inventory` 现在承担 feeder surface 角色
- `Reader` 是 document-first 的深读面
- `AI Workspace` 是独立的全局表面，并会在进入 Reader 时默认停靠在右侧
- `Notebook` 是私有、document-first 的记录表面
- `Project Docs` 才是 shared drafting surface

`demo-native-showcase` 额外保留的，是确定性 reset、打包运行时 handoff，以及从 legacy `/spaces/...` 深链接跳转到 canonical `/projects/...` 的兼容 redirect。这些 `/spaces/...` 现在只是 shim，不再是第二套产品路由真相。

## 已冻结的里程碑边界

当前已冻结的下一波目标仍然是 **统一摄取与深读工作台**。

这个里程碑**不**声称自动推荐已经完成，而是明确冻结以下边界：

- `Discovery & Intake` 仍然是独立边界，但当前已实现的浏览器故事已经改为通过稠密的 `Search` / `Library` feeder surfaces 进入后续工作，而不是以 `/today` 作为主走查路径
- 只有 **已导入库存** 才能进入深读、`Notebook`、证据生成与 `Project Docs`
- `Notebook` 保持 fully private、document-first
- `AI Workspace` 全局可达，并会在 Reader 中停靠，但不会变成 Reader 自己拥有的状态
- `Project Docs` 是 project-owned 的共享写作对象
- notebook 到 project 的过桥现在只能通过浏览器侧显式的 **Insert into project docs** 投影流程，不能直接共享 notebook 本体

浏览器现在已经体现了 route / shell / ownership 的 reset，也已经交付 notebook 到 project 的显式浏览器侧投影操作。

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
- `2026-03-23-jixia-research-workbench-reset-design.md`
- `2026-03-23-jixia-research-workbench-reset-implementation.md`
- `2026-03-24-jixia-research-workbench-reset-risk-first-implementation.md`

## 当前集成展示面

当前 Web 层已经把可运行的 native demo 与已落地的 workbench reset 收敛到一起。

当前已交付内容包括：

- `src/web/app.tsx` 与 `src/web/router.tsx`
- canonical 路由树：`/home`、`/search`、`/library`、`/notebooks`、`/ai`、`/projects`、`/projects/:projectId/...`
- 稳定的三栏 `Research workbench` shell
- 稠密的 `Search intake boards` 与面向 personal / project 的 `Library inventory`
- document-first 的 `Reader`
- 可独立访问且会停靠在 Reader 中的 `AI Workspace`
- 私有的 `Notebook`
- 共享 project-owned drafting surface 的 `Project Docs`
- 由 native HTTP server 驱动的 discovery、settings、personal import、reading detail、notebook document load/save、AI workspace、private/shared note 保存、governed insight，以及 project-doc load/save/publish 接口
- legacy `/spaces/...` 深链接仅保留为兼容 redirect，统一导向 `/projects/...`

`space` 仍然是服务端权限、持久化与审计的权威边界。浏览器路由真相已经切换到 `/projects/...`；当 shared-space 流程需要保留上下文时，会通过显式 `spaceId` query 参数来携带，而不是继续把 `/spaces/...` 当成主路由树。

## 真实运行时说明

- `/login` 仍然存在，但主浏览器流程从 `/home` 开始
- `GET /api/discovery/today` 与 `GET /api/discovery/search?query=...` 支撑当前 discovery 切片，但 `/today` 不再是 reviewer walkthrough 的 canonical 入口
- `GET /api/library/personal` 与 `POST /api/library/personal/import` 由服务端托管个人导入归属
- `GET /api/reading/:entryId`、`POST /api/reading/:entryId/notes`、`POST /api/reading/:entryId/insights` 支撑 document-first Reader 与 note / insight capture
- `GET /api/notebooks/:id`、`GET /api/notebooks/:id/document`、`POST /api/notebooks/:id/document` 支撑 private notebook document model
- `GET /api/ai/workspace` 支撑全局 / docked AI workspace 表面
- `GET /api/writing/:spaceId/projects/:projectId/document` 与 `POST /api/writing/:spaceId/projects/:projectId/document` 现在支撑的是 `Project Docs`，不再是 user-owned Writer draft
- `POST /api/writing/:docId/publish?spaceId=...` 与 governed-summary 路由仍然是 deterministic native demo 的一部分
- `/api/spaces` 与 legacy `/spaces/...` 浏览器入口现在只是 demo/operator 便利或兼容 redirect，不再是 canonical workbench route tree

## 验证快照

当前分支的标准验证仍然以以下命令为准：

- `npm test`
- `npm run typecheck`
- `npm run build`

额外的定向验证还覆盖 canonical routing、personal / project 上下文切换、discovery/import seam、notebook/project projection boundary、project-doc ownership、三栏 shell、Search/Library density、Reader/AI/Notebook/Project Docs 分离、native walkthrough，以及 packaged demo 文档。

## 近期方向

下一阶段的重点分为三条：

1. 在后续迭代中持续保持 operator-facing 文档与 runbook 和当前实际交付一致
2. 在后续迭代中继续保持浏览器侧 notebook-to-project 投影流程与实际交付一致
3. 继续推进 Task 11 的 operator/deployment 路径，让 runtime 能在实验室服务器上稳定复现，同时不再分叉产品模型

## Task 11 运维启动手册

Task 11 的目标是把已经验证过的 web 交互层收敛成一个可重复启动的实验室服务器包。当前运行时会启动一个最小 Node 22 HTTP 服务，托管构建后的浏览器应用、持久化 `server-state.json`，并保留打包 demo 路径用于 reviewer/operator handoff。

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

启动后，服务会从 `dist/` 提供构建后的 workbench shell，在 `/api/` 暴露当前 server-backed 浏览器接口，并保留 `/health` 作为 operator 检查点。当前真实的浏览器走查不再从旧的 `/spaces` + Writer 路径开始，而是从 `Home` 进入 intake/import/deep-reading，再在 shared tumor-board project 上验证 `Project Docs`。

### Docker Compose 启动路径

```bash
cp .env.example .env
docker compose up --build
```

仓库内置的 `docker-compose.yml` 会映射运行端口，把 `JIXIA_STORAGE_ROOT` 固定到挂载后的 `/var/lib/jixia/storage` 路径，把 `JIXIA_DATABASE_URL` 固定到挂载后的 `/var/lib/jixia/data` 路径作为后续 DB-backed 运行时的保留运行时边界，并将 Task 11 的状态文件持久化到 `/var/lib/jixia/storage/server-state.json`。容器启动时运行的是 `.native-demo-package/native-demo` 中的打包产物，而不是直接从源码树启动。
