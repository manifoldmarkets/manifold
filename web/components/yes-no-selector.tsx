import clsx from 'clsx'
import React from 'react'
import { formatMoney } from '../../common/util/format'
import { Col } from './layout/col'
import { Row } from './layout/row'

export function YesNoSelector(props: {
  selected?: 'YES' | 'NO'
  onSelect: (selected: 'YES' | 'NO') => void
  className?: string
  btnClassName?: string
}) {
  const { selected, onSelect, className, btnClassName } = props

  return (
    <Row className={clsx('space-x-3', className)}>
      <button
        className={clsx(
          'hover:bg-primary-focus border-primary hover:border-primary-focus inline-flex flex-1  items-center justify-center rounded-lg border-2 p-2 hover:text-white',
          selected == 'YES'
            ? 'bg-primary text-white'
            : 'text-primary bg-transparent',
          btnClassName
        )}
        onClick={() => onSelect('YES')}
      >
        Buy YES
      </button>
      <button
        className={clsx(
          'inline-flex flex-1 items-center justify-center rounded-lg  border-2 border-red-400 p-2 hover:border-red-500 hover:bg-red-500 hover:text-white',
          selected == 'NO'
            ? 'bg-red-400 text-white'
            : 'bg-transparent text-red-400',
          btnClassName
        )}
        onClick={() => onSelect('NO')}
      >
        Buy NO
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
  const { selected, onSelect } = props

  const btnClassName = clsx('px-6 flex-1', props.btnClassName)

  return (
    <Col className="gap-2">
      {/* Should ideally use a radio group instead of buttons */}
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

      <Button
        color={selected === 'MKT' ? 'blue' : 'gray'}
        onClick={() => onSelect('MKT')}
        className={clsx(btnClassName, 'btn-sm')}
      >
        PROB
      </Button>

      <Button
        color={selected === 'CANCEL' ? 'yellow' : 'gray'}
        onClick={() => onSelect('CANCEL')}
        className={clsx(btnClassName, 'btn-sm')}
      >
        N/A
      </Button>
    </Col>
  )
}

export function ChooseNoneCancelSelector(props: {
  selected: 'CHOOSE' | 'NONE' | 'CANCEL' | undefined
  onSelect: (selected: 'CHOOSE' | 'NONE' | 'CANCEL') => void
  className?: string
  btnClassName?: string
}) {
  const { selected, onSelect, className } = props

  const btnClassName = clsx('px-6 flex-1', props.btnClassName)

  return (
    <Col className={clsx('gap-2', className)}>
      <Button
        color={selected === 'CHOOSE' ? 'green' : 'gray'}
        onClick={() => onSelect('CHOOSE')}
        className={clsx('whitespace-nowrap', btnClassName)}
      >
        Choose an answer
      </Button>

      <Button
        color={selected === 'NONE' ? 'red' : 'gray'}
        onClick={() => onSelect('NONE')}
        className={clsx('whitespace-nowrap', btnClassName)}
      >
        None
      </Button>

      <Button
        color={selected === 'CANCEL' ? 'yellow' : 'gray'}
        onClick={() => onSelect('CANCEL')}
        className={clsx(btnClassName, '')}
      >
        N/A
      </Button>
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

export function BuyButton(props: { className?: string; onClick?: () => void }) {
  const { className, onClick } = props
  return (
    <Button className={className} onClick={onClick} color="green">
      BUY
    </Button>
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
        'inline-flex flex-1 items-center justify-center rounded-md border border-transparent px-8 py-3 font-medium shadow-sm',
        color === 'green' && 'btn-primary text-white',
        color === 'red' && 'bg-red-400 text-white hover:bg-red-500',
        color === 'yellow' && 'bg-yellow-400 text-white hover:bg-yellow-500',
        color === 'blue' && 'bg-blue-400 text-white hover:bg-blue-500',
        color === 'gray' && 'bg-gray-300 text-gray-700 hover:bg-gray-400',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
