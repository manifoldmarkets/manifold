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
        'flex flex-row items-center cursor-pointer select-none whitespace-nowrap rounded-full px-2 py-1.5 outline-none text-sm',
        selected
          ? 'bg-blue-500 text-white hover:bg-blue-600 focus-visible:bg-blue-600'
          : 'bg-ink-200 hover:bg-ink-300 focus-visible:bg-ink-300 text-ink-700',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
