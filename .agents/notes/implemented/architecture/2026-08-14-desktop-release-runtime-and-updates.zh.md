# Agent Note: Desktop release runtime, signing, and updates

Status: implemented

[English](2026-08-14-desktop-release-runtime-and-updates.md) | 中文

## Problem

Electron 壳需要在用户机器上独立运行，不依赖源码目录、pnpm 或另外安装的 Node.js。桌面更新还需要稳定的制品布局、发布标签、签名输入和更新元数据，并与现有 dsh 发布序列保持一致。

## Decision

桌面包使用 electron-builder：Windows 使用 NSIS，macOS 使用 DMG 加 ZIP，Linux 使用 AppImage 加 deb。应用包包含 Electron 主进程和 updater 依赖。独立的 `resources/dsh-runtime` 目录包含部署后的 `@deepseek-ai/dsh` 生产闭包及构建后的 Web 前端；`resources/node-runtime` 包含用于启动子进程的 Node 可执行文件。因此子进程不依赖用户安装的 Node 或 pnpm，同时运行时保留在 ASAR 外部，便于子进程和原生模块加载。

electron-builder 会跳过相对路径名为 `node_modules` 的源目录，因此运行时依赖树通过独立 FileSet 复制到 `resources/dsh-runtime/node_modules`。工作区将 `@electron/get` 固定为 `3.1.0`，因为 electron-builder `26.15.3` 运行时会使用其中导出的缓存模式枚举。

桌面版本与共享 dsh 版本保持一致，并从现有 `dsh-v<version>` 标签发布。GitHub Releases 作为更新源。NSIS 与 macOS ZIP/DMG 制品携带 `electron-updater` 使用的元数据；更新下载后，用户可以确认立即重启安装，也可以在下一次正常退出时安装。Linux 安装包会发布，但按照当前发布约定，桌面壳不会为其调用自动更新。

GitLab CI 接受同一个 `dsh-v<version>` 标签，并行执行原生 Windows、macOS 和 Linux 打包任务。每个任务都会把标签与 `package.json` 校验，并将安装包上传为短期 Job Artifact；runner 标签和可选签名均通过 CI 变量配置，证书继续作为受保护的项目输入。

当 pnpm 通过 `npm_execpath` 暴露原生 Windows `pnpm.exe` 时，无 shell 的仓库门控运行器会直接启动该文件；JavaScript 形式的 pnpm 入口仍通过 Node 执行。

Windows NSIS 安装器保持原生详细信息区域展开，并在解压大型压缩负载期间使用循环进度样式。NSIS 按归档阶段报告进度，把这个数值当作单一整体百分比会导致界面明显倒退；因此安装器改为显示阶段消息，并使用不会倒退的活动指示器。

签名凭据只作为环境输入。Windows 使用 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`；macOS 使用 `CSC_LINK`、`CSC_KEY_PASSWORD` 以及 Apple 公证凭据。CI 从受保护的 Secret 注入这些值，本地打包可以生成用于测试的未签名制品。

生产依赖闭包必须把动态加载 profile 使用的依赖声明为 CLI 的直接依赖。具体来说，telemetry OTEL profile 会通过 peer 边加载 `@deepseek-ai/dsh-session-telemetry`，workflow 和 shell profile 包也有同样的 peer 闭包要求；workspace 提升依赖可能在开发环境中掩盖这些问题。`DSH_BOOT_RUNTIME_PACKAGES` 明确列出启动包边界；部署校验和 Electron `afterPack` 钩子会分别检查运行时及最终应用中的每个清单。打包会在 Electron Builder 之前审计静态及配置导入解析，并执行内置运行时 HTTP 冒烟测试；同时删除 source map、调试符号、异平台可选包和未使用的 `node-pty` 平台 prebuild，保留目标平台所需的原生文件。

桌面壳通过 Electron 默认 session 拒绝 renderer 的权限检查和权限请求。它把 Web profile 输出的 loopback URL 行作为第一个启动信号，再用有上限的 HTTP readiness probe 确认服务可访问；冷启动最多尝试三次，运行中的运行时异常退出后最多自动重启三次。桥接令牌使用长度安全的时序比较，导航、下载和路径打开请求在主进程校验。默认 `DSH_HOME` 位于 Electron 用户数据目录下，因此 profile 管理的社区插件和皮肤包安装到用户拥有的 profile 目录，而不是应用安装目录。Windows 退出时先用 `taskkill /T /F` 终止完整的 Harness 进程树；macOS 关闭最后一个窗口后继续保留应用和 Harness，以便再次激活时重建窗口。桌面单测覆盖这些纯逻辑边界，根 typecheck 会调用包含桌面测试的 TypeScript 项目。

## Alternatives considered

**要求用户安装系统 Node.js：** 放弃，因为桌面安装包必须拥有可预测的运行时，不能假设用户的 Node 版本和 PATH 符合要求。

**把 Harness 运行时放进 ASAR：** 放弃，因为子进程需要普通文件系统路径，运行时还可能加载必须解包的原生模块。

**使用独立更新服务器：** 放弃，因为 GitHub Releases 已经负责 dsh 标签和制品发布；增加另一套服务会重复维护发布元数据和凭据。

**提交证书或只在开发机签名：** 放弃，因为密钥必须留在源码库之外，且不能让未签名 CI 制品被误认为正式发布版本。

## Consequences

桌面打包会执行生产依赖部署并复制 Node 可执行文件，因此制品更大，打包任务需要平台对应的原生依赖解析。动态 import 和原生模块意味着不能在没有自定义解包/加载层的情况下简单把依赖树替换为一个归档文件；清理构建期文件是风险更低的体积优化方式。npm 发布和桌面更新发现现在共用同一个发布标签。macOS 正式分发仍需要 Apple Developer ID 证书和公证；Windows 签名可以提升信任，但普通 OV 证书在积累 SmartScreen reputation 前仍可能显示首次警告。
