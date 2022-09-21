import clsx from 'clsx'
import { ReactNode } from 'react'

export function PillButton(props: {
  selected: boolean
  onSelect: () => void
  color?: string
  xs?: boolean
  className?: string
  children: ReactNode
}) {
  const { children, selected, onSelect, color, xs, className } = props

  return (
    <button
      className={clsx(
        'cursor-pointer select-none whitespace-nowrap rounded-full px-3 py-1.5 text-sm',
        xs ? 'text-xs' : '',
        selected
          ? ['text-white', color ?? 'bg-greyscale-6']
          : 'bg-greyscale-2 hover:bg-greyscale-3',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
