// @vitest-environment jsdom
/** Per-model thinking-level map editor: parsing, storage, and controls. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReasoningEffortsEditor, reasoningEntries, reasoningValue } from '../src/client/ReasoningEffortsEditor.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]
const LEVELS = ['off', 'low', 'high'] as const

function renderEditor(
  value: unknown,
  onChange: (next: Record<string, string | null> | undefined) => void = vi.fn() as (
    next: Record<string, string | null> | undefined,
  ) => void,
  levels: readonly string[] = LEVELS,
  disabled = false,
): void {
  render(
    <ReasoningEffortsEditor
      value={value}
      levels={levels}
      index={1}
      disabled={disabled}
      t={t}
      onChange={onChange}
    />,
  )
}

describe('reasoningEntries', () => {
  it('reads string and null wires and leaves malformed members out', () => {
    expect(reasoningEntries(undefined)).toEqual([])
    expect(reasoningEntries(null)).toEqual([])
    expect(reasoningEntries(false)).toEqual([])
    expect(reasoningEntries('off')).toEqual([])
    expect(reasoningEntries([])).toEqual([])
    expect(reasoningEntries({ off: 'none', low: null, bad: 3, custom: 'x' }))
      .toEqual([
        { level: 'off', wire: 'none' },
        { level: 'low', wire: '' },
        { level: 'custom', wire: 'x' },
      ])
  })
})

describe('reasoningValue', () => {
  it('drops the field when no pair remains and stores an empty off as null', () => {
    expect(reasoningValue([])).toBeUndefined()
    expect(reasoningValue([{ level: 'off', wire: '   ' }])).toEqual({ off: null })
    expect(reasoningValue([{ level: 'low', wire: ' low ' }])).toEqual({ low: 'low' })
    expect(reasoningValue([
      { level: 'off', wire: 'none' },
      { level: 'high', wire: 'high' },
    ])).toEqual({ off: 'none', high: 'high' })
  })
})

describe('ReasoningEffortsEditor', () => {
  it('shows the empty state and adds the first available level', () => {
    const onChange = vi.fn()
    renderEditor(undefined, onChange)

    expect(screen.getByText(en.reasoningLevelsEmpty)).toBeTruthy()
    fireEvent.click(screen.getByText(en.addReasoningLevel))
    expect(onChange).toHaveBeenCalledWith({ off: 'none' })
  })

  it('disables every control and the add action while disabled', () => {
    renderEditor({ off: 'none', low: 'low' }, vi.fn(), LEVELS, true)

    expect(screen.getByLabelText(`${en.modelReasoningLevel} 1 1`).hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText(`${en.modelReasoningWire} 1 1`).hasAttribute('disabled')).toBe(true)
    expect(screen.getByLabelText(`${en.removeReasoningLevel} 1 1`).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: en.addReasoningLevel }).hasAttribute('disabled')).toBe(true)
  })

  it('edits, re-levels, and removes rows without dropping their order', () => {
    const onChange = vi.fn()
    const view = render(
      <ReasoningEffortsEditor
        value={{ off: 'none', low: 'low' }}
        levels={LEVELS}
        index={1}
        disabled={false}
        t={t}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText(`${en.modelReasoningWire} 1 2`), { target: { value: 'lo' } })
    expect(onChange).toHaveBeenLastCalledWith({ off: 'none', low: 'lo' })

    // The owner stores the callback value and re-renders with it; this editor
    // holds no private draft of its own.
    view.rerender(
      <ReasoningEffortsEditor
        value={{ off: 'none', low: 'lo' }}
        levels={LEVELS}
        index={1}
        disabled={false}
        t={t}
        onChange={onChange}
      />,
    )
    fireEvent.change(screen.getByLabelText(`${en.modelReasoningLevel} 1 2`), { target: { value: 'high' } })
    expect(onChange).toHaveBeenLastCalledWith({ off: 'none', high: 'lo' })

    view.rerender(
      <ReasoningEffortsEditor
        value={{ off: 'none', high: 'lo' }}
        levels={LEVELS}
        index={1}
        disabled={false}
        t={t}
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByLabelText(`${en.removeReasoningLevel} 1 1`))
    expect(onChange).toHaveBeenLastCalledWith({ high: 'lo' })
  })

  it('keeps an unknown stored level visible and disables add once every choice is used', () => {
    renderEditor({ off: 'none', custom: 'x' }, vi.fn(), ['off'])

    expect(screen.getByLabelText<HTMLSelectElement>(`${en.modelReasoningLevel} 1 2`).value).toBe('custom')
    expect(screen.getByRole('button', { name: en.addReasoningLevel }).hasAttribute('disabled')).toBe(true)
  })

  it('leaves the off wire empty as null rather than as an empty string', () => {
    const onChange = vi.fn()
    renderEditor({ off: 'none', low: 'low' }, onChange)

    fireEvent.change(screen.getByLabelText(`${en.modelReasoningWire} 1 1`), { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ off: null, low: 'low' })
  })
})
