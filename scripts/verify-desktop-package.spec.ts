import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { resolveResourcesRoot } = require('./verify-desktop-package.cjs') as {
  resolveResourcesRoot: (context: {
    appOutDir: string
    electronPlatformName: string
    packager?: { appInfo?: { productFilename?: string } }
  }) => string
}
const desktopConfig = require('../apps/desktop/electron-builder.config.cjs') as {
  homepage?: string
  linux?: { maintainer?: string }
}

describe('desktop package verification', () => {
  it('resolves the flat resources directory for Windows and Linux', () => {
    expect(resolveResourcesRoot({ appOutDir: 'dist/win-unpacked', electronPlatformName: 'win32' }))
      .toBe(join('dist/win-unpacked', 'resources'))
    expect(resolveResourcesRoot({ appOutDir: 'dist/linux-unpacked', electronPlatformName: 'linux' }))
      .toBe(join('dist/linux-unpacked', 'resources'))
  })

  it('resolves the nested app bundle resources directory for macOS', () => {
    expect(resolveResourcesRoot({
      appOutDir: 'dist/mac-arm64',
      electronPlatformName: 'darwin',
      packager: { appInfo: { productFilename: 'DeepSeek Harness' } },
    })).toBe(join('dist/mac-arm64', 'DeepSeek Harness.app', 'Contents', 'Resources'))
  })

  it('fails clearly when the macOS product filename is unavailable', () => {
    expect(() => resolveResourcesRoot({ appOutDir: 'dist/mac-arm64', electronPlatformName: 'darwin' }))
      .toThrow('macOS product filename')
  })

  it('declares the metadata required by Linux deb packaging', () => {
    expect(desktopConfig.homepage).toBe('https://github.com/deepseek-ai/deepseek-harness')
    expect(desktopConfig.linux?.maintainer).toBe('DeepSeek')
  })
})
