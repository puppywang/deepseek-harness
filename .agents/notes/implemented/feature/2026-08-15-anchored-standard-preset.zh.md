# Agent Note: 锚定标准（anchored-standard）opt-in agent preset

Status: implemented

[English](2026-08-15-anchored-standard-preset.md) | 中文

## 问题

`standard` preset 把一段很长的模板化系统提示词——一个 coding-agent 人格加上逐工具指导——连同完整工具目录一起发送。社区测量报告称，这一组合在某个编码基准上的得分低于 `minimal` preset 的单句人格，而 `minimal` 的工具面（一个常驻 PTY shell 加一个编辑器）又无法承载 standard 工作流。值得评估的主张是：在 `standard` 工具目录之上使用 `minimal` 形态的系统提示词，能在不损失工具的前提下避免得分下降。

## 决策

以 opt-in 方式随附 `anchored-standard` agent preset，位于 `apps/cli/config/agent-presets/anchored-standard/`，`order: 5`。它是在 `standard` 组装上叠加两处差异：

1. `persona` 设置 `complete: true`、`includeRuntimeContext: false`，文本为 `You are a helpful software engineer assistant.`——与 `minimal` preset 的系统提示词逐字节一致。
2. 一个 `tool-bootstrap` 行引用 `./tool-bootstrap.mjs`，配置 `shellTools: [bash, pwsh]` 与 `commonTools: [read]`。

随附的 `agentPresets.default` 现为 `anchored-standard`；[默认切换记录](2026-08-15-anchored-standard-default.md)拥有对原始 opt-in 默认值的这一逆转。

`tool-bootstrap.mjs` 是一个函数插件（`name: 'anchored-tool-bootstrap'`、`inject: ['systemPrompt', 'tools']`）。在 `system-prompt/assemble` 上，一旦 agent 的会话记录了持久的 `tool/call`，它原样返回组装结果；在此之前，它把模型可见的工具列表缩减为一个平台 shell（目录里 `bash`/`pwsh` 二者之一）加 `read`。作用域内的单调 `tools.guard()` 对模型直接执行应用同一组限制，因此晋升前不能通过注册表调用隐藏工具；拥有这些工具的嵌套传输调用仍然可用。完整的 `standard` 目录保持注册，晋升从 agent 自身的持久会话事件中读取，因此每个会话独立引导。目录中配置的 shell 为 0 个或多于 1 个、或缺少某个配置的通用工具时，会直接报错而非在错误的表面上继续。

插件是随 preset 目录一起发布的纯 ESM。`config` 目录本就随 CLI 包发布，Cordis loader 相对组装文件解析相对插件名，因此 `.mjs` 在源码与构建两种布局下都紧邻 preset 解析。同目录的 `.d.mts` 声明让测试与 TypeScript 读者可以为该模块标注类型。

## 测试

`apps/cli/tests/anchored-tool-bootstrap.spec.ts` 导入随附的 `.mjs`，覆盖首次请求收窄、按会话晋升、直接执行拒绝、嵌套调用，以及目录校验的直接报错路径。`apps/cli/tests/web-agent-presets.e2e.ts` 通过带脚本适配器的真实 Web Loader 组装测试，验证首次与晋升后的模型请求，以及直接调用隐藏工具的拒绝。`apps/web/tests/anchored-standard.snapshot.ts` 通过无密钥 Web replay lane 记录相同的请求头。

## 考虑过的替代方案

- **现在就把 `anchored-standard` 设为默认 preset**——本记录随附时否决：支撑证据只有两轮基准运行；当首轮没有工具调用时，晋升触发条件会把 agent 留在两个工具上。默认化应等待更强证据与剩余限制得到更强证据。该决定已被[默认切换记录](2026-08-15-anchored-standard-default.md)逆转。
- **把 `tool-bootstrap` 提升为一等包 `@deepseek-ai/dsh-tool-bootstrap`**——暂缓：它是干净的去处（类型检查、覆盖率门禁、invariant 伴生文件，以及组装里的裸包名），但为了一个 opt-in 实验要新增一个包和一个 CLI 依赖；待 preset 走向默认化时再做。
- **只随附提示词差异、不带 bootstrap**——否决：只改提示词会让完整目录从首次请求起就可见，那并非本实验所测量的内容。

## 后果

- roster 在既有四个 preset 之后新增一个实验条目。已有会话不受影响；随附默认随后在[默认切换记录](2026-08-15-anchored-standard-default.md)中移到了本 preset。
- 晋升前，bootstrap 同时收窄模型可见的工具列表并拒绝模型直接调用其他已注册工具；完整注册仍供嵌套传输调用和晋升后的调用使用。
- `anchored-standard` 组装是 `standard` 的近副本，必须与它同步更新。
- `.mjs` 插件由聚焦测试、真实 CLI/Web 组装测试和 Web 无密钥快照覆盖，但不被包覆盖率门禁覆盖，因为它不是 workspace 包。

## 已知限制与暂缓事项

- 首轮未产生 `tool/call` 时，agent 会一直停留在两个工具上，直到产生为止；没有超时或兜底晋升。
- 证据是单基准上的两轮运行，而非跨模型与任务的对照比较。
- bootstrap 要求恰好存在一个有效的已配置 shell；同时移除 `bash` 与 `pwsh` 的部署会在组装和执行校验时报错。
- `agent.cordis.yml` 复制了 `standard` 的行，因此未来对 `standard` 的改动必须同步镜像，否则两个 preset 会漂移。
