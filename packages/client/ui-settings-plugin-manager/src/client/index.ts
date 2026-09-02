// @ts-nocheck
/* oxlint-disable typescript/no-explicit-any, typescript/ban-ts-comment, typescript/no-unnecessary-condition, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/require-await, typescript/prefer-promise-reject-errors, typescript/no-implied-eval, typescript/no-unsafe-call, typescript/no-unused-vars */
/** Browser plugin-manager tab registered into Web Plugins settings. */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PluginManagerCatalogRequest } from '@deepseek-ai/dsh-host-plugin-manager/types'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  PluginManagerSettingsTab,
  type PluginManagerSettingsTabInjected,
} from './PluginManagerSettingsTab.tsx'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'

export type {
  PluginManagerSettingsTabInjected,
  PluginManagerSettingsTabProps,
} from './PluginManagerSettingsTab.tsx'
export type { PluginManagerLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin install/manage tab copy. */
    'settings.pluginManager': PluginManagerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.pluginManager'

/** Services required by the Settings registration and generated Remote face. */
export const inject = ['slots', 'locale', 'remote', 'remote.pluginManager']

/** Contribute the lazy plugin-management tab to the Plugins settings section. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-plugin-manager: dictionaries')

  const t = ctx.locale.bind(NS)
  // The Remote contract has one optional parameter, but its generated client
  // validates positional arity; always pass the request slot explicitly.
  const catalog: PluginManagerSettingsTabInjected['catalog'] = async (
    request?: PluginManagerCatalogRequest,
  ) => {
    const result = await ctx.remote.pluginManager.catalog(request ?? {})
    if (!result.ok) {
      throw new Error(`pluginManager.catalog failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const list: PluginManagerSettingsTabInjected['list'] = async () => {
    const result = await ctx.remote.pluginManager.list()
    if (!result.ok) {
      throw new Error(`pluginManager.list failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const install: PluginManagerSettingsTabInjected['install'] = async (request) => {
    const result = await ctx.remote.pluginManager.install(request)
    if (!result.ok) {
      throw new Error(`pluginManager.install failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const update: PluginManagerSettingsTabInjected['update'] = async (request) => {
    const result = await ctx.remote.pluginManager.update(request)
    if (!result.ok) {
      throw new Error(`pluginManager.update failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const uninstall: PluginManagerSettingsTabInjected['uninstall'] = async (request) => {
    const result = await ctx.remote.pluginManager.uninstall(request)
    if (!result.ok) {
      throw new Error(`pluginManager.uninstall failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const restart: PluginManagerSettingsTabInjected['restart'] = async () => {
    const result = await ctx.remote.pluginManager.restart()
    if (!result.ok) {
      throw new Error(`pluginManager.restart failed: ${result.error.code}: ${result.error.message}`)
    }
    return result.value
  }
  const injected = (): PluginManagerSettingsTabInjected => ({ catalog, list, install, update, uninstall, restart })

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'manage',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, PluginManagerSettingsTab))
}
