# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Desktop app

DeepSeek Harness ships a standalone Electron desktop app (`@deepseek-ai/dsh-desktop`). Windows, macOS, and Linux installers bundle the Web UI, the `dsh` runtime, and a Node.js runtime, so a desktop install needs no Node.js, pnpm, or source checkout. The desktop shell adds native directory and file opening, Electron download dialogs, single-instance focus, automatic runtime restarts, and GitHub Release updates on Windows and macOS. Installers are built from every `dsh-v<version>` tag and attached to [GitHub Releases](https://github.com/deepseek-ai/deepseek-harness/releases). See the [desktop app documentation](apps/desktop/README.md) for run, packaging, and release details.

## Enhanced mode (anchored)

The flagship session preset is `anchored-standard` (**增强模式（锚定）** in the preset list): a minimal single-sentence system prompt starts with only one platform shell (`bash` or `pwsh`) plus `read`, and the full standard tool catalog unlocks after the model's first tool call. New sessions default to it; switch presets any time in the session preset list.

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI, served at `http://127.0.0.1:3080` by default. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
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
