import clsx from 'clsx'
import React, { ReactNode } from 'react'
import { formatMoney } from 'common/util/format'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { resolution } from 'common/contract'

export function YesNoSelector(props: {
  selected?: 'YES' | 'NO'
  onSelect: (selected: 'YES' | 'NO') => void
  className?: string
  btnClassName?: string
  replaceYesButton?: React.ReactNode
  replaceNoButton?: React.ReactNode
  isPseudoNumeric?: boolean
}) {
  const {
    selected,
    onSelect,
    className,
    btnClassName,
    replaceNoButton,
    replaceYesButton,
    isPseudoNumeric,
  } = props

  const commonClassNames =
    'inline-flex items-center justify-center rounded-3xl border-2 p-2'

  return (
    <Row className={clsx('space-x-3', className)}>
      {replaceYesButton ? (
        replaceYesButton
      ) : (
        <button
          className={clsx(
            commonClassNames,
            selected == 'YES'
              ? 'border-teal-500 bg-teal-500 text-white'
              : selected == 'NO'
              ? 'border-greyscale-3 text-greyscale-3 bg-white hover:border-teal-500 hover:text-teal-500'
              : 'border-teal-500 bg-white text-teal-500 hover:bg-teal-50',
            btnClassName
          )}
          onClick={() => onSelect('YES')}
        >
          {isPseudoNumeric ? 'HIGHER' : 'YES'}
        </button>
      )}
      {replaceNoButton ? (
        replaceNoButton
      ) : (
        <button
          className={clsx(
            commonClassNames,
            selected == 'NO'
              ? 'border-red-400 bg-red-400 text-white'
              : selected == 'YES'
              ? 'border-greyscale-3 text-greyscale-3 bg-white hover:border-red-400 hover:text-red-400'
              : 'border-red-400 bg-white text-red-400 hover:bg-red-50',
            btnClassName
          )}
          onClick={() => onSelect('NO')}
        >
          {isPseudoNumeric ? 'LOWER' : 'NO'}
        </button>
      )}
    </Row>
  )
}

export function YesNoCancelSelector(props: {
  selected: resolution | undefined
  onSelect: (selected: resolution) => void
  className?: string
  btnClassName?: string
}) {
  const { selected, onSelect } = props

  const btnClassName = clsx('px-6 flex-1 rounded-3xl', props.btnClassName)

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

export function ChooseCancelSelector(props: {
  selected: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  onSelect: (selected: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL') => void
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
        color={selected === 'CHOOSE_MULTIPLE' ? 'blue' : 'gray'}
        onClick={() => onSelect('CHOOSE_MULTIPLE')}
        className={clsx('whitespace-nowrap', btnClassName)}
      >
        Choose multiple
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

const fundAmounts = [1000, 2500, 10000]

export function FundsSelector(props: {
  selected: 1000 | 2500 | 10000
  onSelect: (selected: 1000 | 2500 | 10000) => void
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
          color={selected === amount ? 'indigo' : 'gray'}
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
  // Note: styles coppied from YesNoSelector
  return (
    <button
      className={clsx(
        'hover:bg-primary-focus border-primary hover:border-primary-focus inline-flex flex-1  items-center justify-center rounded-lg border-2 p-2 hover:text-white',
        'text-primary bg-transparent text-lg',
        className
      )}
      onClick={onClick}
    >
      Buy
    </button>
  )
}

export function NumberCancelSelector(props: {
  selected: 'NUMBER' | 'CANCEL' | undefined
  onSelect: (selected: 'NUMBER' | 'CANCEL') => void
  className?: string
  btnClassName?: string
}) {
  const { selected, onSelect, className } = props

  const btnClassName = clsx('px-6 flex-1', props.btnClassName)

  return (
    <Col className={clsx('gap-2', className)}>
      <Button
        color={selected === 'NUMBER' ? 'indigo' : 'gray'}
        onClick={() => onSelect('NUMBER')}
        className={clsx('whitespace-nowrap', btnClassName)}
      >
        Choose value
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

function Button(props: {
  className?: string
  onClick?: () => void
  color: 'green' | 'red' | 'blue' | 'indigo' | 'yellow' | 'gray'
  children?: ReactNode
}) {
  const { className, onClick, children, color } = props

  return (
    <button
      type="button"
      className={clsx(
        'inline-flex flex-1 items-center justify-center rounded-md border border-transparent px-8 py-3 font-medium shadow-sm',
        color === 'green' && 'bg-teal-500 text-white hover:bg-teal-600',
        color === 'red' && 'bg-red-400 text-white hover:bg-red-500',
        color === 'yellow' && 'bg-yellow-400 text-white hover:bg-yellow-500',
        color === 'blue' && 'bg-blue-400 text-white hover:bg-blue-500',
        color === 'indigo' && 'bg-indigo-500 text-white hover:bg-indigo-600',
        color === 'gray' && 'bg-gray-200 text-gray-700 hover:bg-gray-300',
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
