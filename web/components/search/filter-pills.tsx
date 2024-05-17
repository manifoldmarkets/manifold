import clsx from "clsx"
import { ReactNode } from "react"

export function FilterPill(props: {
  selected: boolean
  onSelect: () => void
  className?: string
  children: ReactNode
}) {
  const { children, selected, onSelect, className } = props

  return (
    <button
      className={clsx(
        'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full px-2 py-0.5 text-sm outline-none',
        selected
          ? 'hover:bg-primary-600 focus-visible:bg-primary-600 bg-primary-500 text-white'
          : 'bg-ink-200 hover:bg-ink-300 focus-visible:bg-ink-300 text-ink-700',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
