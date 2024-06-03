import { XCircleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { ReactNode } from 'react'
import { Row } from '../layout/row'
import { Filter } from '../supabase-search'

export function FilterPill(props: {
  selected: boolean
  onSelect: () => void
  className?: string
  children: ReactNode
  type: 'filter' | 'sort' | 'contractType' | 'spice'
}) {
  const { children, selected, onSelect, className, type } = props

  return (
    <button
      className={clsx(
        'flex cursor-pointer select-none flex-row items-center whitespace-nowrap rounded-full px-2 py-0.5 text-sm outline-none transition-colors',
        type === 'spice'
          ? selected
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'text-ink-600 hover:bg-sky-amber/30 bg-amber-500/10 dark:bg-amber-500/20 dark:hover:bg-amber-500/30'
          : type === 'filter'
          ? selected
            ? 'bg-sky-500 text-white hover:bg-sky-600'
            : 'text-ink-600 bg-sky-500/10 hover:bg-sky-500/30 dark:bg-sky-500/20 dark:hover:bg-sky-500/30'
          : type === 'sort'
          ? selected
            ? 'hover:bg-primary-600 focus-visible:bg-primary-600 bg-primary-500 text-white'
            : 'bg-primary-500/10 hover:bg-primary-500/30 text-ink-600 dark:bg-primary-500/20 dark:hover:bg-primary-500/30 '
          : selected
          ? 'bg-purple-500 text-white hover:bg-purple-600 focus-visible:bg-purple-600'
          : 'text-ink-600 bg-purple-500/10 hover:bg-purple-500/30 dark:bg-purple-500/20 dark:hover:bg-purple-500/30',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}

export function AdditionalFilterPill(props: {
  className?: string
  children: ReactNode
  type: 'filter' | 'sort' | 'contractType'
  onXClick: () => void
}) {
  const { children, className, type, onXClick } = props

  return (
    <Row
      className={clsx(
        'relative select-none items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-2 pr-1 text-sm outline-none transition-colors',
        type === 'filter'
          ? 'bg-sky-500 text-white'
          : type === 'sort'
          ? 'bg-primary-500 text-white'
          : 'bg-purple-500 text-white',
        className
      )}
    >
      {children}
      <button
        className="text-ink-200 dark:text-ink-800 cursor-pointer rounded-full transition-colors hover:text-white hover:dark:text-white"
        onClick={onXClick}
      >
        <XCircleIcon className="h-4 w-4 " />
      </button>
    </Row>
  )
}
