import clsx from 'clsx'
import { ReactNode } from 'react'

export function PillButton(props: {
  selected: boolean
  onSelect: () => void
  color?: string
  big?: boolean
  children: ReactNode
}) {
  const { children, selected, onSelect, color, big } = props

  return (
    <button
      className={clsx(
        'cursor-pointer select-none whitespace-nowrap rounded-full',
        selected
          ? ['text-white', color ?? 'bg-greyscale-6']
          : 'bg-greyscale-2 hover:bg-greyscale-3',
        big ? 'px-8 py-2' : 'px-3 py-1.5 text-sm'
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
