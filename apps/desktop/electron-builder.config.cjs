const path = require('node:path')

const repositoryRoot = path.resolve(__dirname, '../..')

/** @type {import('app-builder-lib').Configuration} */
module.exports = {
  appId: 'ai.deepseek.harness',
  productName: 'DeepSeek Harness',
  artifactName: 'DeepSeek-Harness-${version}-${os}-${arch}.${ext}',
  copyright: 'Copyright © DeepSeek',
  icon: path.join(repositoryRoot, 'apps/web/public/favicon.svg'),
  asar: true,
  compression: 'maximum',
  forceCodeSigning: process.env.DESKTOP_FORCE_CODE_SIGNING === 'true',
  directories: {
    output: path.join(repositoryRoot, 'dist/desktop'),
    buildResources: path.join(__dirname, 'build-resources'),
  },
  afterPack: path.join(repositoryRoot, 'scripts/verify-desktop-package.cjs'),
  files: [
    'lib/**',
    'package.json',
  ],
  extraResources: [
    {
      from: path.join(repositoryRoot, 'dist/desktop-runtime'),
      to: 'dsh-runtime',
    },
    {
      // electron-builder intentionally skips a source directory named
      // node_modules; copy that directory as its own file set so Node's
      // package resolution works inside the packaged runtime.
      from: path.join(repositoryRoot, 'dist/desktop-runtime', 'node_modules'),
      to: 'dsh-runtime/node_modules',
    },
    {
      from: path.join(repositoryRoot, 'dist/node-runtime'),
      to: 'node-runtime',
    },
  ],
  win: {
    target: ['nsis'],
    executableName: 'deepseek-harness',
    verifyUpdateCodeSignature: true,
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    include: path.join(__dirname, 'build-resources', 'installer.nsh'),
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'DeepSeek Harness',
    runAfterFinish: true,
  },
  mac: {
    ...(process.env.DESKTOP_FORCE_CODE_SIGNING === 'true' ? {} : { identity: null }),
    category: 'public.app-category.developer-tools',
    target: ['dmg', 'zip'],
    hardenedRuntime: true,
    gatekeeperAssess: false,
  },
  linux: {
    category: 'Development',
    maintainer: 'DeepSeek',
    target: ['AppImage', 'deb'],
    executableName: 'deepseek-harness',
  },
  publish: {
    provider: 'github',
    owner: 'deepseek-ai',
    repo: 'deepseek-harness',
    tagNamePrefix: 'dsh-v',
  },
}
