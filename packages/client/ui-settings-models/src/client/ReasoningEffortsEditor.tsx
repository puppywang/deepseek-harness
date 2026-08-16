/**
 * Per-model thinking-level map editor, rendered inside a model row's advanced
 * disclosure. One row is one level→wire spelling pair, and the add control
 * offers only levels the owning adapter's schema declares, so the profile
 * written here is the profile `llm-pi-ai` resolves — no hand-edit in
 * `settings.yaml` needed for a hand-declared provider.
 */

import type { ReactNode } from 'react'
import { IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** One editable level→wire pair. */
export interface ReasoningEffortEntry {
  /** Thinking-level key (`off`, `low`, `high`, …). */
  level: string
  /** Wire spelling; the empty string means "not entered yet" (or null for `off`). */
  wire: string
}

/**
 * Read the editable pairs out of a draft `reasoningEfforts` value. `false`
 * (reasoning disabled), a valueless YAML `null`, and non-object values carry no
 * pairs; unknown non-string members are left out of this editor instead of
 * being rendered as a broken row.
 * @param value - the drafted field.
 * @returns the editable pairs, in stored order.
 */
export function reasoningEntries(value: unknown): ReasoningEffortEntry[] {
  if (value === null || value === false || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([level, wire]) => {
    if (typeof wire === 'string') return [{ level, wire }]
    if (wire === null) return [{ level, wire: '' }]
    return []
  })
}

/**
 * Store the edited pairs back as the profile field. Removing the last pair
 * drops the field (inherit); an empty `off` stores `null`, the one empty wire
 * value `llm-pi-ai` accepts.
 * @param entries - the edited pairs.
 * @returns the field value, or `undefined` when no pair remains.
 */
export function reasoningValue(entries: readonly ReasoningEffortEntry[]): Record<string, string | null> | undefined {
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries.map(({ level, wire }) => {
    const trimmed = wire.trim()
    return trimmed.length === 0 && level === 'off' ? [level, null] : [level, trimmed]
  }))
}

/** Props of {@link ReasoningEffortsEditor}. */
export interface ReasoningEffortsEditorProps {
  /** The drafted `reasoningEfforts` value. */
  value: unknown
  /** Level keys the owning adapter accepts, in its canonical order. */
  levels: readonly string[]
  /** One-based model-row index for accessible labels. */
  index: number
  /** Whether every control is disabled. */
  disabled: boolean
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Replace the whole field; `undefined` drops it. */
  onChange: (next: Record<string, string | null> | undefined) => void
}

/**
 * Render the level→wire pairs and their add/remove controls.
 * @param props - the drafted field, accepted levels, copy, and change callback.
 * @returns the editor block.
 */
export function ReasoningEffortsEditor(props: ReasoningEffortsEditorProps): ReactNode {
  const { t } = props
  const entries = reasoningEntries(props.value)
  const used = new Set(entries.map(entry => entry.level))
  const choices = Array.from(new Set([...props.levels, ...entries.map(entry => entry.level)]))
  const available = choices.filter(level => !used.has(level))
  const replace = (next: readonly ReasoningEffortEntry[]): void => {
    props.onChange(reasoningValue(next))
  }
  const optionsFor = (current: ReasoningEffortEntry): string[] =>
    choices.filter(level => level === current.level || !used.has(level))

  return (
    <div className={styles['reasoningEditor']}>
      <span className={styles['modelFieldLabel']}>{t('modelReasoningLevels')}</span>
      {entries.length === 0
        ? <p className={styles['advancedHint']}>{t('reasoningLevelsEmpty')}</p>
        : null}
      {entries.map((entry, at) => (
        <div className={styles['reasoningRow']} key={`${entry.level}-${String(at)}`}>
          <select
            className={`${styles['input']} ${styles['selectInput']}`}
            value={entry.level}
            aria-label={`${t('modelReasoningLevel')} ${String(props.index)} ${String(at + 1)}`}
            disabled={props.disabled}
            onChange={(event) => {
              replace(entries.map((current, currentAt) =>
                currentAt === at ? { ...current, level: event.target.value } : current))
            }}
          >
            {optionsFor(entry).map(level => <option key={level} value={level}>{level}</option>)}
          </select>
          <input
            className={styles['input']}
            type="text"
            value={entry.wire}
            placeholder={entry.level === 'off'
              ? t('modelReasoningOffPlaceholder')
              : t('modelReasoningWirePlaceholder')}
            aria-label={`${t('modelReasoningWire')} ${String(props.index)} ${String(at + 1)}`}
            disabled={props.disabled}
            onChange={(event) => {
              replace(entries.map((current, currentAt) =>
                currentAt === at ? { ...current, wire: event.target.value } : current))
            }}
          />
          <button
            type="button"
            className={styles['iconButton']}
            aria-label={`${t('removeReasoningLevel')} ${String(props.index)} ${String(at + 1)}`}
            title={t('removeReasoningLevel')}
            disabled={props.disabled}
            onClick={() => { replace(entries.filter((_entry, entryAt) => entryAt !== at)) }}
          >
            <IconTrashOutline16 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles['addModelButton']}
        disabled={props.disabled || available.length === 0}
        onClick={() => {
          const next = available[0]
          /* v8 ignore next -- the button is disabled while no level is available */
          if (next === undefined) return
          replace([...entries, { level: next, wire: next === 'off' ? 'none' : '' }])
        }}
      >
        {t('addReasoningLevel')}
      </button>
    </div>
  )
}
