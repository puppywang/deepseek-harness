# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 独立桌面端

DeepSeek Harness 提供独立的 Electron 桌面应用（`@deepseek-ai/dsh-desktop`）。Windows、macOS、Linux 安装包内置 Web UI、`dsh` 运行时与 Node.js 运行时，桌面安装无需 Node.js、pnpm 或源码目录。桌面壳额外提供原生目录与文件打开、Electron 下载保存对话框、单实例聚焦、运行时自动重启，以及 Windows/macOS 上的 GitHub Release 自动更新。Web UI 内置 VS Code 风格的工作区文件浏览器，文件可直接在应用内的可编辑标签页中打开。每个 `dsh-v<version>` 标签都会构建安装包并附加到 [GitHub Releases](https://github.com/deepseek-ai/deepseek-harness/releases)。运行、打包与发布细节见[桌面端文档](apps/desktop/README.zh.md)。

## 增强模式（锚定）

主打会话预设是 `anchored-standard`（预设列表中的「增强模式（锚定）」）：以一句极简系统提示词起步，首次只开放一个平台 shell（`bash` 或 `pwsh`）加 `read`；模型完成首次工具调用后，自动解锁完整标准工具目录。新会话默认使用该模式，也可随时在会话预设中切换。

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 社区插件可以扩展 Web UI。内置的工作区文件浏览器来自 [`dsh-plugin-file-explorer`](https://github.com/bearllfleed/Dsh-FileExplorer)；安装其他插件用 `dsh plugin --profile web add <package>`，并在 profile 的 `cordis.patch.yml` 中启用对应行。
- 本项目已获 [LINUX DO](https://linux.do/) 社区认可。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
