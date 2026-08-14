# Agent Note: 跨平台桌面安装包校验

Status: implemented

[English](2026-08-15-cross-platform-desktop-package-validation.md) | 中文

## 问题

Electron Builder 在 Windows 和 Linux 上把 `app.asar` 直接放在 `resources` 下，但在 macOS 上会放在 `<Product>.app/Contents/Resources` 下。统一的资源根目录假设让 Windows 打包通过，却使 macOS 在运行时冒烟测试成功后、最终校验阶段失败。Linux `.deb` 打包器还要求桌面配置声明项目主页和维护者元数据，而原配置没有提供这些字段。

## 决策

桌面包的 package manifest 声明仓库主页，构建配置声明明确的 Linux 维护者。主页保留在 package manifest 中，因为 electron-builder 26 会拒绝把它作为根配置字段。安装包校验器按 Electron 平台解析资源根目录：macOS 使用 `packager.appInfo.productFilename` 定位应用包，Windows 和 Linux 使用扁平的 `appOutDir/resources` 目录。所有安装包校验继续针对解析后的根目录执行，包括 `app.asar`、内置 Node 运行时、CLI 入口和启动包清单。

## 考虑过的替代方案

- **在校验器中硬编码 `DeepSeek Harness.app`**——否决：应用包名称已经由 Electron Builder 的 product filename 负责；品牌变化时应继续使用同一来源定位路径。
- **在 macOS 上跳过安装包校验**——否决：macOS 制品与其他平台一样需要保证运行时和启动包完整。
- **把主页放进 Electron Builder 根配置**——否决：electron-builder 26 会拒绝该对象中的 `homepage` 字段；package manifest 负责提供元数据，维护者仍作为 Linux 选项显式声明。

## 后果

- macOS 打包会校验真实的 `.app` 包，而不是一个不存在的扁平目录。
- Linux AppImage 和 `.deb` 目标可以提供 `fpm` 要求的元数据并完成构建。
- 资源根目录解析逻辑以纯函数形式覆盖三种桌面平台，以及 macOS 缺少 product filename 的错误路径。
