# Agent Note: 锚定标准成为随附默认预设

Status: implemented

[English](2026-08-15-anchored-standard-default.md) | 中文

## 问题

`anchored-standard` preset 以 opt-in 条目随附，但 README、桌面版发布与 LINUX DO 推广都把锚定模式作为主打体验。未命名预设的新会话仍然组装 `standard`，因此首次使用的用户得到的是锚定模式旨在避免的长模板提示词，推广中的默认体验与实际随附默认不一致。

## 决策

在 `packages/bundle/web-app/cordis.patch.yml` 中把 `agentPresets.default` 设为 `anchored-standard`。未命名预设的新会话组装锚定 preset：一句极简系统提示词加单平台 shell 与 `read` 的 bootstrap，在首次持久 `tool/call` 后晋升为完整 standard 工具目录。用户设置层仍然覆盖组装默认值，在 `standard`、`minimal`、`code` 或 `cordis` 下创建的会话保持其创建时的 preset。[原始 preset 记录](2026-08-15-anchored-standard-preset.md)拥有组装与 bootstrap 机制；本记录拥有默认切换。

Web e2e scaffold 的测试默认保持 `standard`，以稳定回放 fixture。随附默认通过真实 bundle 层在 `apps/cli/tests/web-agent-presets.e2e.ts` 中钉住。

## 考虑过的替代方案

- **保持 `standard` 为随附默认，把锚定模式描述为 opt-in**——否决：产品推广（桌面版发布与 LINUX DO 社区 README）把锚定模式作为默认体验呈现，首次运行静默组装 `standard` 与这一承诺相矛盾。
- **等待更强的基准证据再默认化**——否决：原始证据仍然有限，但产品决策是现在随附推广中的模式；证据上限记录在[原始 preset 记录](2026-08-15-anchored-standard-preset.md)中。
- **删除 `standard`，或把锚定提示词并入其中**——否决：`standard` 仍是完整提示词参考组装，保留可选可维持比较基线，并为希望首次请求即获得完整提示词的会话提供退路。

## 后果

- 未命名的新会话获得 bootstrap 工具面；完整目录始终注册，并在首次持久工具调用后对模型可见。
- 首轮没有工具调用时，agent 会停留在两个工具上直到产生工具调用为止；这现在是默认路径的限制，而非 opt-in 限制。
- `apps/cli/tests/web-agent-presets.e2e.ts` 通过真实 base 与 web bundle 层钉住随附默认；Web e2e scaffold 保持 `standard` 作为测试默认，使无关回放黄金文件保持稳定。
- `anchored-standard` 与 `standard` 仍是必须同步更新的近副本。
