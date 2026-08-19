# @deepseek-ai/dsh-client-ui-settings-plugin-manager

[English](README.md) | 中文

浏览器端的 **插件** 标签页，在 Web Settings 中管理 profile 插件。客户端注册一个 `settings.plugins.tab` 贡献，id 为 `manage`（排在只读的 `all` 清单页之后）。它惰性读取 `ctx.remote.pluginManager.list()`，并通过同一 Remote 提供 GitHub `dsh-plugin` 发现列表（`pluginManager.catalog`）与安装（spec + 启用行）、更新、卸载操作。Host 会把 patch 栈重新应用到正在运行的 Loader，因此变更无需重启即可生效；当 Host 报告 `restartRequired: true` 时，标签页会先弹出确认框，明确提示会中断正在运行的对话，再调用 `pluginManager.restart`。

注册使用 `ctx.slots.inject()`，因此会遵循晚声明、重复声明、locale 变化与 teardown，而无需导入 section 属主。

## 模型体验

无；本包只负责在浏览器设置中展示和驱动 Host 拥有的插件变更界面。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

- **目录基于 GitHub 话题**——标签页列出标记为 `dsh-plugin` 的仓库；暂未展示策展/npm registry 元数据。
- **热重载由 Host 负责**——标签页只在热加载失败时提示重启；它本身不能重启 Host。
- **没有 bundle 层编辑器**——支持卸载与更新；运行中 Loader 行的切换由 Host 的 patch 栈重载处理。