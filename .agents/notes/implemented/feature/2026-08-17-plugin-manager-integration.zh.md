# Agent Note: profile 插件管理集成

Status: implemented

[English](2026-08-17-plugin-manager-integration.md) | 中文

## 问题

安装插件需要系统 pnpm 与 `dsh plugin` CLI，而打包桌面应用两者都不在 PATH 上。Plugins 设置页只有只读的 Loader 清单，因此桌面用户没有受支持的安装、更新或卸载 profile 插件的路径。

## 决策

新增共享的 Host 侧 profile 管理器（`@deepseek-ai/dsh-plugin-manager`），统一负责 pnpm 编排、bundle 对账与 `cordis.patch.yml` 行编辑。它接受注入的 pnpm runner，并把 `@pnpm/exe` 作为依赖，因此 CLI 与 Host 都无需系统安装 pnpm 即可运行 pnpm。

新增 Host Remote 服务（`@deepseek-ai/dsh-host-plugin-manager`，命名空间 `pluginManager`），暴露 `list`、`install`、`update`、`uninstall`。web-app 组合包挂载它，`dsh-api-remotes` 发布客户端面，`dsh-client-connection` 像 settings／credentials 一样把四个方法钉在 loopback。

新增浏览器 Settings 标签页（`@deepseek-ai/dsh-client-ui-settings-plugin-manager`），列出已安装插件并提供安装（spec + 启用行）、更新与卸载。现有只读清单页保持独立。

## 考虑过的替代方案

- **只在桌面安装包里捆绑 pnpm，不放进共享管理器**——否决：源码/开发安装的 CLI 仍需要系统 pnpm，Host 服务也没有统一的 pnpm 解析路径。
- **把变更放进现有 plugin-inventory 服务**——否决：该服务刻意只读、没有变更路径；独立管理器让清单快照保持纯净。
- **先只做 CLI 安装**——否决：用户明确要求在打包 UI 内方便地安装插件。

## 后果

- `dsh plugin` CLI 行为保持不变（同样的提示与退出码），并在 `pnpm` 缺失时回退到内置 pnpm 可执行文件。
- web profile 新增 loopback 特权插件管理 API；变更会通过根 Include 的 patch 栈重新应用到运行中的 Loader，因此重启只是无法热加载原生模块的插件所用的回退方案。
- 新客户端标签页是第一版 UI：支持包名/git spec 安装，但还没有 GitHub 目录发现。
- `@pnpm/exe` 加入批准的 build-scripts allowlist；其 preinstall 在安装时组装平台可执行文件。