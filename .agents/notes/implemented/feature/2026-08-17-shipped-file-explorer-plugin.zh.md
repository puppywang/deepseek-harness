# Agent Note: 随附社区工作区文件浏览器

Status: implemented

[English](2026-08-17-shipped-file-explorer-plugin.md) | 中文

## 问题

打包后的桌面应用与 `dsh web` 只能通过模型工具调用或把路径交给操作系统来查看文件。社区插件 [`dsh-plugin-file-explorer`](https://github.com/bearllfleed/Dsh-FileExplorer) 为 Web UI 增加了 VS Code 风格的工作区文件浏览器，但打包用户没有基于 pnpm 的安装路径；产品 README 已经宣传了这个插件，却没有安装包随附它。

## 决策

把 `dsh-plugin-file-explorer` 以 `^0.2.0` 版本随附进 `@deepseek-ai/dsh-web-app`：该包成为 bundle 的依赖，`cordis.patch.yml` 在浏览器插件名录旁插入 `file-explorer` 行。因此每个 `dsh web` 与桌面构建无需 profile 编辑或 pnpm 就会组装该插件。插件的 host 半边在 `/plugin/file-explorer` 下注册有界文件路由；client 半边贡献浏览器 UI。随附前已审查源码：没有 child-process 或 eval 使用，路径访问限制在 host cwd 与已注册 workspace 路径内，读取与上传都有字节上限。

仍支持 profile 安装副本：早期 README 中的命令 `dsh plugin --profile web add dsh-plugin-file-explorer` 对旧构建依然有效，也可用于独立于随附版本更新某个 profile 副本。

## 考虑过的替代方案

- **保持插件仅社区提供，只记录 pnpm 安装路径**——否决：打包桌面用户没有可用的 `dsh` CLI 或 pnpm，记录中的安装路径无法服务桌面发布所面向的用户。
- **把插件源码 vendor 进仓库**——否决：该包已发布且可作为普通依赖安装，vendor 会复制它的发布节奏。
- **立刻把浏览器改成官方 workspace 包**——否决：插件由社区作者维护；先以钉住依赖的方式随附，能立即提供能力，而无需马上转移所有权。

## 后果

- 新的 `dsh web`／桌面安装默认获得工作区文件浏览器；后续 profile patch 仍可禁用或替换该行。
- web-app bundle 现在在 workspace 包之外携带一个外部运行时依赖（`dsh-plugin-file-explorer ^0.2.0`）。
- 已经安装过该插件的现有 profile 可能组装两行：自己的 patch 行与随附行。重复 id 守卫不适用，因为两行 id 不同；更新到随附该行的构建后，运营者应删除 profile 行。
- 插件仍由社区维护；与未来 dsh 发布的兼容性是插件作者的发布责任，本仓库只钉住随附版本。
