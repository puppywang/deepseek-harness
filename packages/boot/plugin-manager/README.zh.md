# @deepseek-ai/dsh-plugin-manager

[English](README.md) | 中文

共享的 Host 侧 profile 插件管理库。它拥有 `dsh plugin` CLI 与 Host pluginManager 服务都需要的 profile 操作：profile 初始化、通过注入的 runner 编排 pnpm 安装／更新／卸载、`dsh.profile.bundles` 对账、`cordis.patch.yml` 行的启用／禁用，以及已安装插件列表。内置的 `@pnpm/exe` 可执行文件提供了无需系统安装即可使用的 pnpm，这正是打包桌面应用能够安装插件的原因。

每个操作都把 pnpm 执行作为 `ProfilePluginRunPnpm` 注入，因此 CLI 可以经由 `spawnSync` 透传输出，Host 可以驱动 subprocess seam。成功安装／更新／卸载后，会基于内部捕获的运行前 manifest 对账 bundle 层；`enable: true` 会为不会以 bundle 自动加载的包添加且只添加一条幂等的 Loader 行。所有写入只修改 profile manifest 与 `cordis.patch.yml`。

## 模型体验

无；本库不注册任何面向模型的内容，也不发送提供方请求。

#### KV Cache 影响

无；本包既不组装也不发送模型输入。

## 已知限制与延期工作

- **重启在库外**——变更会报告 `restartRequired: true`，但本库从不重启或重载运行中的 Loader。
- **一次一个 profile**——操作只寻址单个 `profileDir`；并发调用方必须自行串行化写入。
