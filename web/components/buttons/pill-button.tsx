import clsx from 'clsx'
import { ReactNode } from 'react'
import { CheckIcon } from '@heroicons/react/outline'
import { Row } from 'web/components/layout/row'

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
          ? ['text-ink-0', color ?? 'bg-ink-600']
          : 'bg-ink-200 hover:bg-ink-300',
        className
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
export function ExplicitPillButton(props: {
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
          ? ['text-ink', color ?? 'bg-blue-500']
          : 'bg-ink-200 hover:bg-ink-300',
        className
      )}
      onClick={onSelect}
    >
      <Row className={'items-center justify-items-start'}>
        {children}
        {selected && <CheckIcon className="ml-1.5 h-4 w-4" />}
      </Row>
    </button>
  )
}
