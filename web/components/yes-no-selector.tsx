import React from 'react'
import { Row } from './layout/row'

export function YesNoSelector(props: {
  selected: 'YES' | 'NO'
  onSelect: (selected: 'YES' | 'NO') => void
  yesLabel?: string
  noLabel?: string
  className?: string
}) {
  const { selected, onSelect, yesLabel, noLabel, className } = props

  return (
    <Row className={className}>
      <Button
        color={selected === 'YES' ? 'green' : 'deemphasized'}
        hideFocusRing
        onClick={() => onSelect('YES')}
      >
        {yesLabel ?? 'Yes'}
      </Button>

      <Button
        color={selected === 'NO' ? 'red' : 'deemphasized'}
        hideFocusRing
        onClick={() => onSelect('NO')}
        className="ml-3"
      >
        {noLabel ?? 'No'}
      </Button>
    </Row>
  )
}

function Button(props: {
  className?: string
  onClick?: () => void
  color: 'green' | 'red' | 'deemphasized'
  hideFocusRing?: boolean
  children?: any
}) {
  const { className, onClick, children, color, hideFocusRing } = props

  return (
    <button
      type="button"
      className={classNames(
        'inline-flex items-center px-8 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white',
        !hideFocusRing && 'focus:outline-none focus:ring-2 focus:ring-offset-2',
        color === 'green' &&
          'btn-primary',
        color === 'red' && 'bg-red-400 hover:bg-red-500 focus:ring-red-400',
        color === 'deemphasized' &&
          'text-gray-700 bg-gray-200 hover:bg-gray-300 focus:ring-gray-300',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function classNames(...classes: any[]) {
  return classes.filter(Boolean).join(' ')
}
