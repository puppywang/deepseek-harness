# @deepseek-ai/dsh-client-ui-settings-plugin-manager

[English](README.md) | 中文

浏览器端的 **插件** 标签页，在 Web Settings 中管理 profile 插件。客户端注册一个 `settings.plugins.tab` 贡献，id 为 `manage`（排在只读的 `all` 清单页之后）。它惰性读取 `ctx.remote.pluginManager.list()`，并通过同一 Remote 提供安装（spec + 启用行）、更新与卸载操作。所有变更都会报告 `restartRequired`；标签页会提示用户变更后重启。

注册使用 `ctx.slots.inject()`，因此会遵循晚声明、重复声明、locale 变化与 teardown，而无需导入 section 属主。

## 模型体验

无；本包只负责在浏览器设置中展示和驱动 Host 拥有的插件变更界面。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

- **没有目录发现**——标签页目前手动输入包名或 git spec；GitHub `dsh-plugin` 目录后续再做。
- **重启由用户执行**——标签页只显示重启提示，不能重启 Host 或桌面应用。
- **没有 bundle 层编辑器**——支持卸载与更新；不重启直接切换运行中的 Loader 行暂不支持。