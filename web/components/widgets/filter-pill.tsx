import { CheckIcon, XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ReactNode } from 'react'

/** Off = don't filter on this at all, include = only these, exclude = never these. */
export type FilterState = 'off' | 'include' | 'exclude'

const NEXT_STATE: Record<FilterState, FilterState> = {
  off: 'include',
  include: 'exclude',
  exclude: 'off',
}

export const cycleFilterState = (state: FilterState) => NEXT_STATE[state]

/** Whether an item with the given attribute passes the filter. */
export const passesFilter = (state: FilterState, hasAttribute: boolean) =>
  state === 'off' || (state === 'include' ? hasAttribute : !hasAttribute)

/** A pill you click to cycle between not filtering, including, and excluding. */
export function FilterPill(props: {
  state: FilterState
  onChange: (state: FilterState) => void
  className?: string
  children: ReactNode
}) {
  const { state, onChange, className, children } = props

  return (
    <button
      type="button"
      aria-pressed={state !== 'off'}
      title={
        state === 'include'
          ? 'Only showing these — click to exclude them'
          : state === 'exclude'
          ? 'Hiding these — click to clear'
          : 'Click to only show these'
      }
      className={clsx(
        'flex h-6 cursor-pointer select-none flex-row items-center gap-1 whitespace-nowrap rounded-full px-2 text-sm outline-none transition-colors',
        state === 'include'
          ? 'bg-primary-500 hover:bg-primary-600 focus-visible:bg-primary-600 text-white'
          : state === 'exclude'
          ? 'bg-scarlet-500 hover:bg-scarlet-600 focus-visible:bg-scarlet-600 text-white'
          : 'bg-ink-200 hover:bg-ink-300 focus-visible:bg-ink-300 text-ink-600 dark:bg-ink-300 dark:hover:bg-ink-400',
        className
      )}
      onClick={() => onChange(NEXT_STATE[state])}
    >
      {state === 'include' && <CheckIcon className="h-3 w-3" />}
      {state === 'exclude' && <XIcon className="h-3 w-3" />}
      {children}
    </button>
  )
}
