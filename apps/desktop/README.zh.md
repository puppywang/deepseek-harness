# @deepseek-ai/dsh-desktop

[English](README.md) | 中文

这个包是 DeepSeek Harness 的 Electron 桌面壳。它以 loopback 子进程启动内置的 `dsh web`，等待操作系统分配端口，再把该 URL 加载到加固配置的 `BrowserWindow` 中。现有 Web client、API 路由、WebSocket 流和插件组合继续作为桌面行为的唯一来源。桌面壳还会启动一个带令牌认证的 loopback 桥，让 Host 请求 Electron 主进程打开原生目录和由 Host 解析的路径。

## 运行

在仓库根目录安装依赖并构建 Harness 产物，然后启动桌面壳：

```sh
pnpm install
pnpm run build
pnpm desktop
```

`pnpm desktop` 会构建 Electron 主进程，并打开带 DevTools 的开发窗口。`pnpm desktop:build` 只构建桌面主进程；`pnpm --filter @deepseek-ai/dsh-desktop run start` 启动不带 DevTools 的窗口。

开发启动需要先运行 `pnpm run build`，以生成 CLI 和 Web 产物。`pnpm desktop:package` 会为安装版应用执行完整的生产构建和运行时部署。

社区插件应使用 Harness 自己的插件入口安装，例如 `dsh plugin --profile web add <package>`。桌面版默认把 `DSH_HOME` 放在 Electron 用户数据目录的 `dsh-home` 下，因此 Web profile 的插件落在用户目录的 `profiles/web/node_modules`，升级或卸载安装包不会删除它们。皮肤也应作为声明了 `dsh.bundle` / `dsh.client` 的正式 DSH 插件包安装，不要复制到安装目录或 `resources`。

## 打包

在仓库根目录构建生产运行时和 Windows NSIS 安装包：

```sh
pnpm desktop:package
```

安装包和自动更新元数据会输出到 `dist/desktop`。安装包包含构建后的 CLI、Web 前端、生产依赖和 Node 运行时，因此安装后不要求用户预装 Node.js、pnpm 或保留源码目录。运行时放在 Electron ASAR 外部，因为其中包含子进程代码和原生模块。

平台命令分别是 `pnpm --filter @deepseek-ai/dsh-desktop run build:installer:win`、`build:installer:mac` 和 `build:installer:linux`。Windows 使用 NSIS，macOS 使用 DMG 加 ZIP，Linux 使用 AppImage 加 deb。

Windows 完成目录打包后，可以运行 `pnpm desktop:launch:smoke:win`，它会用隔离的用户数据目录启动实际打包出来的 EXE，等待 `dsh web` 的 HTTP 响应，再安全回收本次冒烟进程树。

Windows NSIS 安装器默认展开原生详细信息区域，并在解压压缩后的应用负载期间使用不会倒退的循环进度条。这样不会把 NSIS 按阶段计算的百分比误认为整体百分比；底部区域还会显示准备安装和最终配置阶段。

每个打包命令都会在 Electron Builder 之前审计运行时的静态及配置导入，并对内置的 `dsh web` 执行冒烟测试；Electron Builder 的 `afterPack` 还会再次检查安装包内的启动包清单，并解析 macOS 应用包特有的 resources 路径。桌面包的 package manifest 提供项目主页，Linux 目标显式声明 `.deb` 输出所需的维护者元数据。生产运行时会移除 source map、调试符号、异平台可选 native 包和未使用的原生 prebuild，同时保留目标平台所需的原生模块。桌面壳不会把 `node_modules/**` 作为 Electron 的全量 `asarUnpack` 规则；外置运行时是因为独立 Node 子进程不能直接读取 `app.asar`。

## 运行约定

子进程绑定 `127.0.0.1` 并使用端口 `0`，因此桌面壳不会把 Harness HTTP 服务暴露到指定网络端口。桌面进程只有在收到 URL 后再通过有限次数的 HTTP readiness probe 确认服务可访问，并对启动失败重试；运行中异常退出时最多自动重启三次。桌面进程通过该 loopback URL 复用现有 Web 载体，并拒绝跳转到分配来源之外的地址。`http`、`https` 和 `mailto` 链接的页面跳转与新窗口请求会由 Electron 主进程交给操作系统处理。原生应用菜单只承载平台级功能：Windows 和 Linux 默认隐藏菜单栏，按 Alt 呼出；macOS 保留系统菜单以及剪贴板快捷键所需的编辑角色；帮助菜单链接 GitHub、文档、版本下载和 LINUX DO；重新加载与开发者工具仅在开发版出现。产品操作继续留在 Web UI，不在原生菜单里复制。桌面桥同样只绑定 `127.0.0.1`、使用操作系统分配的端口，并为目录选择和路径打开分别要求每次启动随机生成的令牌；桥地址只传给 Host 子进程，不暴露给 renderer。Host 的路径打开请求使用 Electron 的 `shell.openPath`；macOS 文本编辑请求使用 `open -t`。Harness 页面发起的下载使用 Electron 保存对话框，并对建议文件名进行清理。打包版本使用 `resources/node-runtime` 下的 Node 运行时；开发版本依次使用 `DSH_NODE_BIN`、`npm_node_execpath` 或系统 `node`。`DSH_HOME` 用于选择已有 Harness 数据目录；未设置时，数据放在 Electron 用户数据目录下的 `dsh-home`。`DSH_CLI_ENTRY` 可以覆盖内置 CLI 入口，`DSH_RUNTIME_ROOT` 可以覆盖内置 Harness 运行时目录。Electron 默认 session 会拒绝 renderer 发起的权限请求，仅放行 Web UI 复制控件所需的 `clipboard-sanitized-write` 权限检查。Windows 退出时会先终止 Harness 进程树，失败后才回退到直接终止子进程；macOS 关闭最后一个窗口后会继续保留应用和 Harness，以便再次激活时重建窗口。

## 自动更新

打包版 Windows 和 macOS 应用启动后会检查 `deepseek-ai/deepseek-harness` 的 GitHub Release。Windows NSIS 和 macOS DMG/ZIP 发布会生成 `electron-updater` 使用的元数据；更新下载完成后，用户可以确认立即重启，也可以在退出应用时自动安装。按照当前发布约定，Linux 安装包不会调用自动更新器。离线或本地测试时设置 `DSH_DISABLE_AUTO_UPDATE`。更新要求 GitHub Release 使用对应的 `dsh-v<version>` 标签，并且 macOS 制品已签名。

## 签名和 CI

GitHub Actions 桌面发布工作流从 `dsh-v<version>` 标签构建 Windows、macOS 和 Linux 制品，并把它们附加到 GitHub Release。Windows 签名读取 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`；macOS 签名及公证读取 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID`。这些值只放在仓库或环境 Secret 中，绝不提交到代码库。当 `DESKTOP_FORCE_CODE_SIGNING` 不是 `true` 时，macOS 会显式禁用签名，避免空的 CI Secret 被误解析为证书路径；正式签名任务保持 identity 未设置，并在缺少所需 Secret 时失败。

GitLab CI 使用同一个 `dsh-v<version>` 标签并行运行原生 Windows、macOS 和 Linux 打包任务，并将各平台安装包作为 Job Artifact 提供下载。如果 GitLab runner 标签不同于默认值，请设置 `DESKTOP_WINDOWS_RUNNER_TAG`、`DESKTOP_MACOS_RUNNER_TAG` 和 `DESKTOP_LINUX_RUNNER_TAG`；签名输入应继续保存在受保护的 CI 变量中。

## 范围

这个桌面包包含启动、单实例聚焦、启动诊断、DevTools 模式、自动隐藏的原生应用菜单、由 Electron 负责的目录和路径打开、外部链接交接、下载保存、安装包、CI 签名制品、GitHub Release 更新和子进程回收。系统托盘和通用 IPC fetch 载体仍属于独立扩展；这些能力必须通过窄化的主进程桥接接入，不能把 Node.js 暴露给 renderer。
