import clsx from 'clsx'
import React from 'react'
import { formatMoney } from '../lib/util/format'
import { Col } from './layout/col'
import { Row } from './layout/row'

export function YesNoSelector(props: {
  selected?: 'YES' | 'NO'
  onSelect: (selected: 'YES' | 'NO') => void
  className?: string
}) {
  const { selected, onSelect, className } = props

  return (
    <Row className={clsx('space-x-3', className)}>
      <button
        className={clsx(
          'flex-1 inline-flex justify-center items-center p-2  hover:bg-primary-focus hover:text-white rounded-lg border-primary hover:border-primary-focus border-2',
          selected == 'YES'
            ? 'bg-primary text-white'
            : 'bg-transparent text-primary'
        )}
        onClick={() => onSelect('YES')}
      >
        YES
      </button>
      <button
        className={clsx(
          'flex-1 inline-flex justify-center items-center p-2  hover:bg-red-500 hover:text-white rounded-lg border-red-400 hover:border-red-500 border-2',
          selected == 'NO'
            ? 'bg-red-400 text-white'
            : 'bg-transparent text-red-400'
        )}
        onClick={() => onSelect('NO')}
      >
        NO
      </button>
    </Row>
  )
}

export function YesNoCancelSelector(props: {
  selected: 'YES' | 'NO' | 'MKT' | 'CANCEL' | undefined
  onSelect: (selected: 'YES' | 'NO' | 'MKT' | 'CANCEL') => void
  className?: string
  btnClassName?: string
}) {
  const { selected, onSelect, className } = props

  const btnClassName = clsx('px-6 flex-1', props.btnClassName)

  return (
    <Col>
      <Row className={clsx('space-x-3 w-full', className)}>
        <Button
          color={selected === 'YES' ? 'green' : 'gray'}
          onClick={() => onSelect('YES')}
          className={btnClassName}
        >
          YES
        </Button>

        <Button
          color={selected === 'NO' ? 'red' : 'gray'}
          onClick={() => onSelect('NO')}
          className={btnClassName}
        >
          NO
        </Button>
      </Row>

      <Row className={clsx('space-x-3 w-full', className)}>
        <Button
          color={selected === 'MKT' ? 'blue' : 'gray'}
          onClick={() => onSelect('MKT')}
          className={clsx(btnClassName, 'btn-sm')}
        >
          MKT
        </Button>

        <Button
          color={selected === 'CANCEL' ? 'yellow' : 'gray'}
          onClick={() => onSelect('CANCEL')}
          className={clsx(btnClassName, 'btn-sm')}
        >
          N/A
        </Button>
      </Row>
    </Col>
  )
}

const fundAmounts = [500, 1000, 2500, 10000]

export function FundsSelector(props: {
  selected: 500 | 1000 | 2500 | 10000
  onSelect: (selected: 500 | 1000 | 2500 | 10000) => void
  className?: string
  btnClassName?: string
}) {
  const { selected, onSelect, className } = props
  const btnClassName = clsx('!px-2 whitespace-nowrap', props.btnClassName)

  return (
    <Row className={clsx('space-x-3', className)}>
      {fundAmounts.map((amount) => (
        <Button
          key={amount}
          color={selected === amount ? 'green' : 'gray'}
          onClick={() => onSelect(amount as any)}
          className={btnClassName}
        >
          {formatMoney(amount)}
        </Button>
      ))}
    </Row>
  )
}

function Button(props: {
  className?: string
  onClick?: () => void
  color: 'green' | 'red' | 'blue' | 'yellow' | 'gray'
  children?: any
}) {
  const { className, onClick, children, color } = props

  return (
    <button
      type="button"
      className={clsx(
        'flex-1 inline-flex justify-center items-center px-8 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white',
        color === 'green' && 'btn-primary',
        color === 'red' && 'bg-red-400 hover:bg-red-500',
        color === 'yellow' && 'bg-yellow-400 hover:bg-yellow-500',
        color === 'blue' && 'bg-blue-400 hover:bg-blue-500',
        color === 'gray' && 'text-gray-700 bg-gray-300 hover:bg-gray-400',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
