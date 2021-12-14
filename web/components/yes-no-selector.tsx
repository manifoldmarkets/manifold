import clsx from 'clsx'
import React from 'react'
import { Row } from './layout/row'

export function YesNoSelector(props: {
  selected: 'YES' | 'NO'
  onSelect: (selected: 'YES' | 'NO') => void
  className?: string
}) {
  const { selected, onSelect, className } = props

  return (
    <Row className={clsx('space-x-3', className)}>
      <Button
        color={selected === 'YES' ? 'green' : 'gray'}
        onClick={() => onSelect('YES')}
      >
        Yes
      </Button>

      <Button
        color={selected === 'NO' ? 'red' : 'gray'}
        onClick={() => onSelect('NO')}
      >
        No
      </Button>
    </Row>
  )
}

export function YesNoCancelSelector(props: {
  selected: 'YES' | 'NO' | 'CANCEL' | undefined
  onSelect: (selected: 'YES' | 'NO' | 'CANCEL') => void
  className?: string
}) {
  const { selected, onSelect, className } = props

  return (
    <Row className={clsx('space-x-3', className)}>
      <Button
        color={selected === 'YES' ? 'green' : 'gray'}
        onClick={() => onSelect('YES')}
        className="px-6"
      >
        Yes
      </Button>

      <Button
        color={selected === 'NO' ? 'red' : 'gray'}
        onClick={() => onSelect('NO')}
        className="px-6"
      >
        No
      </Button>

      <Button
        color={selected === 'CANCEL' ? 'yellow' : 'gray'}
        onClick={() => onSelect('CANCEL')}
        className="px-6"
      >
        Cancel
      </Button>
    </Row>
  )
}

function Button(props: {
  className?: string
  onClick?: () => void
  color: 'green' | 'red' | 'yellow' | 'gray'
  children?: any
}) {
  const { className, onClick, children, color } = props

  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center px-8 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white',
        color === 'green' && 'btn-primary',
        color === 'red' && 'bg-red-400 hover:bg-red-500',
        color === 'yellow' && 'bg-yellow-400 hover:bg-yellow-500',
        color === 'gray' && 'text-gray-700 bg-gray-300 hover:bg-gray-400',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
