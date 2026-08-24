# Agent Note: 桌面外壳独占 Web 表层与品牌

Status: implemented

[English](2026-08-24-desktop-shell-owns-web-surface-and-brand.md) | 中文

## 问题

打包后的桌面应用每次启动都会把服务地址交给默认浏览器，因为 `dsh web` 面向终端场景的浏览器交接默认开启，而桌面子进程参数从未抑制它。另外，安装包构建运行的是根 `build` 脚本，没有选择客户端 profile，导致打包前端静默烤入 `DSH Local Build` 兜底标题，而不是官方品牌。

## 决策

- 桌面外壳通过一个统一的助手构造 `dsh web` 子进程参数，始终携带 `--no-open`：Electron 窗口是唯一的目标表层。
- 所有安装包入口（`build:installer*`、`release`）改跑根 `build:official` profile，把 `DSH_CLIENT_TITLE=DeepSeek Harness` 绑定进随包发布的前端产物。
- 运行时冒烟检查在部署前端的 `<title>` 不是官方品牌时直接失败，丢失 profile 的问题再也无法到达已发布的安装包。

## 备选方案

- **仅靠配置抑制**（经 profile patch 设置 `openBrowser: false`）——否决：桌面外壳在 spawn 时拥有子进程契约，而 patch 文件是用户可编辑的面。
- **只在 CI 断言标题**——否决：冒烟检查在每个 OS 的打包作业内部运行，那是产物发布前的最后一道关口。

## 后果

- 桌面启动不再与应用窗口并排打开系统浏览器标签页。
- 已发布的安装包携带官方标题；未来的品牌回归会让打包作业带着重建指引直接失败，而不是发出去。
