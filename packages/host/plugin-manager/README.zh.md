# @deepseek-ai/dsh-host-plugin-manager

[English](README.md) | 中文

用于 profile 插件管理的 Host Remote 服务。`PluginManagerGateway` 注册 `pluginManager` 服务，并发布 Typert 生成的 `list`、`install`、`update`、`uninstall` Remote。它组合共享的 `@deepseek-ai/dsh-plugin-manager` 库与 subprocess seam，通过内置 `@pnpm/exe` 二进制执行 pnpm，无需系统安装 pnpm——这正是打包桌面应用内能够安装插件的路径。

每个变更都按与 CLI 相同的语义写 `$DSH_HOME/profiles/web` manifest 与 `cordis.patch.yml`：声明 `dsh.bundle` 的依赖会加入 profile 层列表；安装时 `enable: true` 会为非 bundle 包添加一条幂等 Loader 行。每次变更后，服务会把完整的组合 profile patch 栈重新应用到正在运行的根 Include，因此安装／更新／卸载的插件无需重启 dsh 即可生效。如果该热重载无法完成，变更结果会报告 `restartRequired: true`；浏览器标签页会先请用户确认，再调用 `pluginManager.restart`，因为重启会中断当前正在运行的对话。`pluginManager.restart` 调用启动器提供的 `ctx.appExit`，桌面外壳会自动重启 harness 子进程。

## 模型体验

无；此 Host-only 服务不注册任何提示词、工具、消息或提供方能力，也不发送提供方请求。

#### KV Cache 影响

无；本包既不组装也不发送模型输入。

## 已知限制与延期工作

- **单一 profile**——本服务管理 `web` profile（`resolveProfileDir('web')`）；暂不暴露多 profile 管理。
- **原生模块可能无法热加载**——服务会立即重新应用 patch 栈；若某个插件热加载失败，会报告其 Loader 错误，并以进程重启作为回退。