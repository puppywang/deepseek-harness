# Agent Note: 跨 profile 层去重顶层 patch insert

Status: implemented

[English](2026-08-19-patch-insert-dedupe.md) | 中文

## 问题

升级已有用户 profile 时可能启动失败，报错为 `duplicate loader entry id: file-explorer`。`dsh-web-app` bundle 会插入 `dsh-plugin-file-explorer`，而旧版本用户如果已经插入过同一行（例如以前手动安装过该插件），扁平化后的 patch 栈里就会出现两个相同 id 的顶层 insert。Loader 拒绝重复 id，因此桌面端报“dsh web 连续 3 次启动失败”。

## 决策

在 `@deepseek-ai/dsh-app-boot` 中新增共享的 `dedupePatchInserts` 工具。按应用顺序扫描扁平化 patch 栈：某个 id 第一次以顶层 `insert` 出现时保留，之后相同 id 的 insert 行丢弃。该工具在所有 patch 栈进入 Loader 的路径上统一应用：

- `mountRootInclude`（首次启动）
- `reloadRootInclude`（插件热重载）
- `composeEntries`（配置 dump 与行索引）
- `profile-boot` 的 `allPatches` 与 `composeLive`（启动与 HMR 用户层重载）

用户已有行保持权威；新 bundle 仍可为不存在的 id 新增行。

## 考虑过的替代方案

- 从 web-app bundle 中移除 `file-explorer`——否决：全新 profile 会失去内置文件管理器，而且任何“bundle 与 profile 都插入同一插件”的组合都会有同样的重复风险。
- 修改 vendored include 容忍重复——否决：vendored Loader 应保持上游行为；去重是 app boot 层拥有的组合策略。

## 后果

- 存在重复 file-explorer 行的升级用户 profile 可以正常启动。
- Bundle 层可以安全插入旧 profile 已有的插件。
- id-targeted patch 不变；只有顶层 `insert` 行会在空 profile 根上产生重复 id。