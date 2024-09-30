import clsx from 'clsx'
import { ReactNode } from 'react'

export function PillButton(props: {
  selected: boolean
  onSelect: () => void
  xs?: boolean
  className?: string
  children: ReactNode
  type?: 'mana' | 'sweepies'
}) {
  const { children, selected, onSelect, xs, className, type = 'mana' } = props

  return (
    <button
      className={clsx(
        'cursor-pointer select-none whitespace-nowrap rounded-full px-3 py-1 outline-none',
        xs ? 'text-xs' : 'text-sm',
        type === 'sweepies'
          ? selected
            ? 'bg-amber-600 text-white hover:bg-amber-600'
            : 'text-ink-600 bg-amber-500/10 hover:bg-amber-500/30 dark:bg-amber-500/20 dark:hover:bg-amber-500/30'
          : selected
          ? 'bg-blue-500 text-white hover:bg-blue-600 focus-visible:bg-blue-600'
          : 'bg-ink-200 hover:bg-ink-300 focus-visible:bg-ink-300',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
