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
- `npm test` → 15 个测试文件 / 41 个测试全部通过
- `npm run build`

这意味着当前 UI 已适合做界面评审与人工走查，
但它仍然是工作流壳，而不是已经接通全部真实业务流的前端产品。

## 近期方向

下一阶段的交付重点分为两条：

1. 完成 Task 11 的 Docker-first 部署脚手架与 operator 文档
2. 以当前 Task 10 壳为基础，继续接入真实的 server-backed Web 交互

`docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md` 中记录了
Task 10 的已交付内容、验证证据，以及向下一阶段的 handoff。
