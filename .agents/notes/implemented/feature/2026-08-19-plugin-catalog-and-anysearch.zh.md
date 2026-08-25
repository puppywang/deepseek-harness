# Agent Note: GitHub 插件目录与内置 AnySearch

Status: implemented

[English](2026-08-19-plugin-catalog-and-anysearch.md) | 中文

## 问题

Plugins 设置页只能手动输入包名/git spec 安装插件，用户无法发现社区插件。另外，AnySearch 团队发布了 `@anysearch/anysearch-dsh` bundle 插件，应该随桌面 Web 面内置，而不是要求用户手动安装。

## 决策

- 在 Host Remote 中新增 `pluginManager.catalog`，让 Plugins 设置页能渲染可安装目录，并可通过现有 `pluginManager.install` 安装任意条目。发现机制已不再使用 GitHub 话题搜索；现行基于 npm 的机制由[本地插件目录索引](2026-08-20-plugin-catalog-local-index.zh.md)承接。
- 将 AnySearch 随 Web 应用内置：把 `@anysearch/anysearch-dsh` 加入 `@deepseek-ai/dsh-web-app` 的依赖，并在 `cordis.patch.yml` 中挂载其两行 patch（`web.searchProvider: anysearch` 与 `web-search-anysearch` insert）。这样所有 web profile 都能使用 AnySearch，无需修改用户 profile manifest。

## 考虑过的替代方案

- **静态策展目录文件**——第一版否决：生态已经用 `dsh-plugin` GitHub 话题做发现，动态话题查询无需仓库侧 PR 就能让新插件可见。
- **客户端直接调 GitHub API**——否决：浏览器需要 token/rate 预算，且每个用户暴露网络行为；Host 后续可缓存并拥有网络策略。
- **只通过 profile 模板安装 AnySearch**——否决：已有 profile 不会获得它。内置到 `dsh-web-app` 意味着更新后的应用随处携带。

## 后果

- web profile 现在默认把 AnySearch 作为 `web` 搜索提供方，并挂载其高级工具。
- 用户无需离开应用即可从 Plugins 标签页发现并安装社区插件。
- `pluginManager.catalog` 是普通（非 loopback 钉住）的只读 Remote；目录只暴露公共 npm 元数据，不暴露 Host 配置。
