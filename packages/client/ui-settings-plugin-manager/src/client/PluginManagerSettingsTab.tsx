/** Plugin installation and management tab for the Plugins settings section. */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  InstalledPluginView,
  PluginManagerCatalog,
  PluginManagerCatalogEntry,
  PluginManagerMutation,
  PluginManagerRestartResult,
  PluginManagerSnapshot,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconSearchOutline16,
  RiskConfirmation,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './PluginManagerSettingsTab.module.css'

/** Registration-side Remote face used by the tab. */
export interface PluginManagerSettingsTabInjected {
  /** Read the installed plugin snapshot. */
  list: () => Promise<PluginManagerSnapshot>
  /** Read the GitHub `dsh-plugin` catalog. */
  catalog: () => Promise<PluginManagerCatalog>
  /** Install one package; `enable` adds its Loader row. */
  install: (request: { spec: string; enable: boolean }) => Promise<PluginManagerMutation>
  /** Update one installed package. */
  update: (request: { packageName: string }) => Promise<PluginManagerMutation>
  /** Remove one installed package. */
  uninstall: (request: { packageName: string }) => Promise<PluginManagerMutation>
  /** Ask the Host to restart dsh; call only after the user confirms. */
  restart: () => Promise<PluginManagerRestartResult>
}

/** Full component props assembled by the Settings slot renderer. */
export type PluginManagerSettingsTabProps =
  PropsRuntime<'settings.plugins.tab'>
  & PropsLocale<'settings.pluginManager'>
  & InjectFace<PluginManagerSettingsTabInjected>

type ViewState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly snapshot: PluginManagerSnapshot }

/** Whether one row matches the local search query. */
function matches(plugin: InstalledPluginView, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return plugin.packageName.toLocaleLowerCase().includes(normalizedQuery)
}

/** Whether one catalog row matches the local search query. */
function matchesEntry(entry: PluginManagerCatalogEntry, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) return true
  return `${entry.packageName} ${entry.description ?? ''} ${entry.repo}`
    .toLocaleLowerCase()
    .includes(normalizedQuery)
}

type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly entries: readonly PluginManagerCatalogEntry[] }

/** Render the installed-plugin manager. */
export function PluginManagerSettingsTab(props: PluginManagerSettingsTabProps): ReactNode {
  const { catalog, list, install, update, uninstall, restart, t } = props
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [catalogState, setCatalogState] = useState<CatalogState>({ status: 'loading' })
  const [catalogQuery, setCatalogQuery] = useState('')
  const [spec, setSpec] = useState('')
  const [enableRow, setEnableRow] = useState(true)
  const [busyPackage, setBusyPackage] = useState<string>()
  const [mutationError, setMutationError] = useState<string>()
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [restartAcknowledged, setRestartAcknowledged] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [restartError, setRestartError] = useState<string>()

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => list()).then(
      (snapshot) => { if (current) setState({ status: 'ready', snapshot }) },
      () => { if (current) setState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [list, request])

  useEffect(() => {
    let current = true
    void Promise.resolve().then(() => catalog()).then(
      (result) => { if (current) setCatalogState({ status: 'ready', entries: result.entries }) },
      () => { if (current) setCatalogState({ status: 'error' }) },
    )
    return () => { current = false }
  }, [catalog])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const normalizedCatalogQuery = catalogQuery.trim().toLocaleLowerCase()
  const plugins = useMemo(
    () => state.status === 'ready'
      ? state.snapshot.plugins.filter(plugin => matches(plugin, normalizedQuery))
      : [],
    [normalizedQuery, state],
  )
  const catalogEntries = useMemo(
    () => catalogState.status === 'ready'
      ? catalogState.entries.filter(entry => matchesEntry(entry, normalizedCatalogQuery))
      : [],
    [catalogState, normalizedCatalogQuery],
  )
  const installedNames = useMemo(
    () => new Set(state.status === 'ready' ? state.snapshot.plugins.map(plugin => plugin.packageName) : []),
    [state],
  )

  const refresh = (): void => {
    setMutationError(undefined)
    setRequest(previous => previous + 1)
  }

  const runMutation = async (action: () => Promise<PluginManagerMutation>, packageName: string): Promise<void> => {
    setMutationError(undefined)
    setBusyPackage(packageName)
    try {
      const result = await action()
      if (result.restartRequired) {
        setRestartAcknowledged(false)
        setRestartError(undefined)
        setShowRestartConfirm(true)
      }
      refresh()
    } catch {
      setMutationError(t('mutateFailed'))
    } finally {
      setBusyPackage(undefined)
    }
  }

  const confirmRestart = async (): Promise<void> => {
    setRestarting(true)
    setRestartError(undefined)
    try {
      await restart()
    } catch {
      setRestartError(t('restartFailed'))
      setRestarting(false)
    }
  }

  return (
    <div className={css.tab}>
      <p className={css.intro}>{t('intro')}</p>
      <p className={css.restart}>{t('restartHint')}</p>

      <h3 className={css.installTitle}>{t('discoverTitle')}</h3>
      <p className={css.intro}>{t('discoverIntro')}</p>
      <div className={css.searchRow}>
        <IconSearchOutline16 size={14} />
        <input
          className={css.input}
          type="search"
          value={catalogQuery}
          placeholder={t('discoverSearch')}
          aria-label={t('discoverSearch')}
          onChange={(event) => { setCatalogQuery(event.target.value) }}
        />
      </div>
      {catalogState.status === 'loading' ? <p className={css.intro}>{t('discoverLoading')}</p> : null}
      {catalogState.status === 'error'
        ? (
          <p className={css.error}>
            {t('discoverFailed')}
            <button
              type="button"
              onClick={() => { setCatalogState({ status: 'loading' }); void Promise.resolve().then(() => catalog()).then(
                (result) => { setCatalogState({ status: 'ready', entries: result.entries }) },
                () => { setCatalogState({ status: 'error' }) },
              ) }}
            >
              {t('retry')}
            </button>
          </p>
        )
        : null}
      {catalogState.status === 'ready' && catalogEntries.length === 0
        ? <p className={css.intro}>{t('discoverEmpty')}</p>
        : null}
      {catalogState.status === 'ready' && catalogEntries.length > 0
        ? (
          <ul className={css.list}>
            {catalogEntries.map((entry) => {
              const installed = installedNames.has(entry.packageName)
              return (
                <li className={css.row} key={entry.packageName}>
                  <div className={css.rowHead}>
                    <code className={css.packageName}>{entry.packageName}</code>
                    {entry.stars > 0 ? <span className={css.meta}>★ {entry.stars}</span> : null}
                    <a className={css.meta} href={entry.homepage ?? undefined} target="_blank" rel="noreferrer">{entry.repo}</a>
                  </div>
                  <div className={css.rowActions}>
                    <button
                      type="button"
                      disabled={installed || busyPackage !== undefined}
                      onClick={() => { void runMutation(() => install({ spec: entry.packageName, enable: true }), entry.packageName) }}
                    >
                      {installed ? t('discoverInstalled') : busyPackage === entry.packageName ? t('discoverInstalling') : t('discoverInstall')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )
        : null}

      <form
        className={css.installForm}
        onSubmit={(event) => {
          event.preventDefault()
          if (spec.trim().length === 0) return
          void runMutation(
            () => install({ spec: spec.trim(), enable: enableRow }),
            '',
          ).then(() => { setSpec('') })
        }}
      >
        <h3 className={css.installTitle}>{t('installTitle')}</h3>
        <input
          className={css.input}
          type="text"
          value={spec}
          placeholder={t('installPlaceholder')}
          aria-label={t('installSpec')}
          disabled={busyPackage !== undefined}
          onChange={(event) => { setSpec(event.target.value) }}
        />
        <label className={css.enableRow}>
          <input
            type="checkbox"
            checked={enableRow}
            disabled={busyPackage !== undefined}
            onChange={(event) => { setEnableRow(event.target.checked) }}
          />
          {t('enableRow')}
        </label>
        <button
          className={css.installButton}
          type="submit"
          disabled={spec.trim().length === 0 || busyPackage !== undefined}
        >
          {busyPackage === '' ? t('installing') : t('install')}
        </button>
      </form>

      {mutationError === undefined ? null : <p className={css.error}>{mutationError}</p>}

      <div className={css.searchRow}>
        <IconSearchOutline16 size={14} />
        <input
          className={css.input}
          type="search"
          value={query}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          onChange={(event) => { setQuery(event.target.value) }}
        />
      </div>

      {state.status === 'loading' ? <p className={css.intro}>{t('installing')}</p> : null}
      {state.status === 'error'
        ? (
          <p className={css.error}>
            {t('loadFailed')}
            <button type="button" onClick={() => { setState({ status: 'loading' }); refresh() }}>{t('retry')}</button>
          </p>
        )
        : null}
      {state.status === 'ready' && plugins.length === 0
        ? <p className={css.intro}>{normalizedQuery.length === 0 ? t('empty') : t('noMatch')}</p>
        : null}
      {state.status === 'ready'
        ? (
          <ul className={css.list}>
            {plugins.map(plugin => (
              <li className={css.row} key={plugin.packageName}>
                <div className={css.rowHead}>
                  <code className={css.packageName}>{plugin.packageName}</code>
                  <span className={css.meta}>{t('version')}: {plugin.version ?? '\u2014'}</span>
                  <span className={css.meta}>{t('source')}: {plugin.source === 'dependency' ? t('dependency') : t('template')}</span>
                  {plugin.bundle ? <span className={css.meta}>{t('bundle')}</span> : null}
                  {plugin.client ? <span className={css.meta}>{t('client')}</span> : null}
                  <span className={css.meta}>{plugin.enabled ? t('enabled') : ''}</span>
                </div>
                <div className={css.rowActions}>
                  <button
                    type="button"
                    disabled={busyPackage !== undefined}
                    onClick={() => { void runMutation(() => update({ packageName: plugin.packageName }), plugin.packageName) }}
                  >
                    {busyPackage === plugin.packageName ? t('updating') : t('update')}
                  </button>
                  <button
                    type="button"
                    disabled={busyPackage !== undefined || plugin.source === 'template'}
                    onClick={() => {
                      if (!window.confirm(t('removeConfirm').replace('{package}', plugin.packageName))) return
                      void runMutation(() => uninstall({ packageName: plugin.packageName }), plugin.packageName)
                    }}
                  >
                    {busyPackage === plugin.packageName ? t('uninstalling') : t('uninstall')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
        : null}

      <RiskConfirmation
        open={showRestartConfirm}
        title={t('restartConfirmTitle')}
        description={restartError === undefined ? t('restartConfirmDescription') : restartError}
        acknowledgeLabel={t('restartAcknowledge')}
        cancelLabel={t('restartCancel')}
        confirmLabel={restarting ? t('restarting') : t('restartConfirm')}
        acknowledged={restartAcknowledged}
        disabled={restarting}
        onAcknowledgedChange={setRestartAcknowledged}
        onCancel={() => { setShowRestartConfirm(false) }}
        onConfirm={() => { void confirmRestart() }}
      />
    </div>
  )
}
