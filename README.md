# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Desktop app

DeepSeek Harness ships a standalone Electron desktop app (`@deepseek-ai/dsh-desktop`). Windows, macOS, and Linux installers bundle the Web UI, the `dsh` runtime, and a Node.js runtime, so a desktop install needs no Node.js, pnpm, or source checkout. The desktop shell adds native directory and file opening, Electron download dialogs, single-instance focus, automatic runtime restarts, and GitHub Release updates on Windows and macOS. A VS Code-style workspace file explorer is bundled with the Web UI, so files open in editable tabs inside the app. Installers are built from every `dsh-v<version>` tag and attached to [GitHub Releases](https://github.com/deepseek-ai/deepseek-harness/releases). See the [desktop app documentation](apps/desktop/README.md) for run, packaging, and release details.

## Enhanced mode (anchored)

The flagship session preset is `anchored-standard` (**增强模式（锚定）** in the preset list): a minimal single-sentence system prompt starts with only one platform shell (`bash` or `pwsh`) plus `read`, and the full standard tool catalog unlocks after the model's first tool call. New sessions default to it; switch presets any time in the session preset list.

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Community plugins extend the Web UI. The bundled workspace file explorer comes from [`dsh-plugin-file-explorer`](https://github.com/bearllfleed/Dsh-FileExplorer); install other plugins with `dsh plugin --profile web add <package>` and enable their row in the profile's `cordis.patch.yml`.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.
- This project is recognized by the [LINUX DO](https://linux.do/) community.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
