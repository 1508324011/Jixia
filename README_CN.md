# 稷下

稷下是一个面向实验室团队的、以服务器为中心的科研协作平台。
它计划部署在实验室内网服务器上，由服务端持有权威数据，并围绕空间、文献资产、阅读流程、
版本化写作与受治理的 AI 作业来组织团队科研工作。

## 当前阶段

当前仓库已经具备两层对齐的基础：

1. 面向 spaces、library、reading、writing 与 governed AI jobs 的 server-first 后端骨架
2. 面向 `Spaces -> Library -> Reader -> Writing` 的第一版学术工作流 Web 壳

bootstrap 护栏仍然保留，但项目已经不再只是仓库初始化状态。
当前分支反映的是一个经过验证的 Task 10 UI 壳，而不是占位用的 Web 入口。

## 计划文档

详细设计与实施计划位于 `docs/plans/`：

- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`
- `2026-03-22-jixia-task-11-deployment-implementation.md`

## Task 10 当前状态

当前分支已经完成 Task 10 的第一版浏览器工作流壳，现状包括：

- `src/web/app.tsx` 与 `src/web/router.tsx`
- spaces、library、reader、writing 四个页面壳
- 最小设计 token 与共享页面样式
- visibility、shared context、publish state、governed AI/job 等治理信号
- 覆盖主导航链路与 direct deep link 的 UI 测试

## 验证快照

当前分支最近一次验证结果：

- `npm run typecheck`
- `npm test` → 16 个测试文件 / 48 个测试全部通过
- `npm run build`

这意味着当前 UI 已适合做界面评审与人工走查，
但它仍然是工作流壳，而不是已经接通全部真实业务流的前端产品。

## 近期方向

下一阶段的交付重点分为两条：

1. 在具备 Docker 的 operator 机器上实测 Task 11，并把运行时从当前 shell + health 边界继续向前推进
2. 以当前 Task 10 壳为基础，继续接入真实的 server-backed Web 交互

`docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md` 中记录了
Task 10 的已交付内容、验证证据，以及向下一阶段的 handoff。

## Task 11 运维启动手册

Task 11 的目标是把已经验证过的 Task 10 Web 壳收敛成一个可重复启动的实验室服务器包。
当前运行时会启动一个最小 Node 22 HTTP 服务、托管构建后的 Task 10 Web shell，并暴露 `GET /health`。
它还不代表浏览器端已经完成全部实时 server-backed 数据接入。

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

启动后，服务会从 `dist/` 提供构建后的 Task 10 shell，并在 `/health` 暴露健康检查端点。

### Docker Compose 启动路径

```bash
cp .env.example .env
docker compose up --build
```

仓库内置的 `docker-compose.yml` 会映射运行端口，把 `JIXIA_STORAGE_ROOT`
固定到挂载后的 `/var/lib/jixia/storage`，把 `JIXIA_DATABASE_URL` 固定到挂载后的
`/var/lib/jixia/data` 以保留后续兼容性，并将 Task 11 的状态文件持久化到
`/var/lib/jixia/storage/server-state.json`。
