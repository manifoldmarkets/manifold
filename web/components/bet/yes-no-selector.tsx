import clsx from 'clsx'
import React from 'react'
import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/solid'

import { Row } from '../layout/row'
import { resolution } from 'common/contract'
import { Button } from '../buttons/button'

export function YesNoSelector(props: {
  selected?: 'YES' | 'NO' | 'LIMIT'
  onSelect: (selected: 'YES' | 'NO') => void
  className?: string
  btnClassName?: string
  yesLabel?: string
  noLabel?: string
}) {
  const { selected, onSelect, className, btnClassName, yesLabel, noLabel } =
    props

  return (
    <Row className={clsx('space-x-3', className)}>
      <Button
        color={selected && selected !== 'YES' ? 'green-outline' : 'green'}
        size="xl"
        onClick={() => onSelect('YES')}
        className={btnClassName}
      >
        {yesLabel ? yesLabel : 'YES'}
        <ArrowUpIcon className="ml-1 h-4 w-4" />
      </Button>

      <Button
        color={selected && selected !== 'NO' ? 'red-outline' : 'red'}
        size="xl"
        onClick={() => onSelect('NO')}
        className={btnClassName}
      >
        {noLabel ? noLabel : 'NO'}
        <ArrowDownIcon className="ml-1 h-4 w-4" />
      </Button>
    </Row>
  )
}

export function YesNoCancelSelector(props: {
  selected: resolution | undefined
  onSelect: (selected: resolution) => void
  className?: string
}) {
  const { selected, onSelect } = props

  const btnClassName =
    'px-0 !py-2 flex-1 first:rounded-l-xl last:rounded-r-xl rounded-r-none rounded-l-none'

  return (
    <Row className="gap-1">
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
        className={btnClassName}
      >
        PROB
      </Button>

      <Button
        color={selected === 'CANCEL' ? 'yellow' : 'gray'}
        onClick={() => onSelect('CANCEL')}
        className={btnClassName}
      >
        N/A
      </Button>
    </Row>
  )
}

export function ChooseCancelSelector(props: {
  selected: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  onSelect: (selected: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL') => void
}) {
  const { selected, onSelect } = props

  const btnClassName =
    'flex-1 font-medium sm:first:rounded-l-xl sm:last:rounded-r-xl sm:rounded-none whitespace-nowrap'

  return (
    <div className="flex flex-col gap-1 sm:flex-row">
      <Button
        color={selected === 'CHOOSE' ? 'green' : 'gray'}
        size="xl"
        onClick={() => onSelect('CHOOSE')}
        className={btnClassName}
      >
        Choose answer
      </Button>

      <Button
        color={selected === 'CHOOSE_MULTIPLE' ? 'blue' : 'gray'}
        size="xl"
        onClick={() => onSelect('CHOOSE_MULTIPLE')}
        className={btnClassName}
      >
        Choose multiple
      </Button>

      <Button
        color={selected === 'CANCEL' ? 'yellow' : 'gray'}
        size="xl"
        onClick={() => onSelect('CANCEL')}
        className={btnClassName}
      >
        N/A
      </Button>
    </div>
  )
}

export function BuyButton(props: { className?: string; onClick?: () => void }) {
  const { className, onClick } = props
  // Note: styles coppied from YesNoSelector
  return (
    <button
      className={clsx(
        'hover:bg-teal-600-focus hover:border-teal-600-focus hover:text-ink-0 inline-flex flex-1  items-center justify-center rounded-lg border-2 border-teal-600 p-2',
        'bg-transparent text-lg text-teal-500',
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
}) {
  const { selected, onSelect } = props

  const btnClassName = 'flex-1 font-medium whitespace-nowrap'

  return (
    <Row className={'gap-1'}>
      <Button
        color={selected === 'NUMBER' ? 'indigo' : 'gray'}
        size="lg"
        onClick={() => onSelect('NUMBER')}
        className={clsx(btnClassName, 'rounded-l-xl rounded-r-none')}
      >
        Choose value
      </Button>

      <Button
        color={selected === 'CANCEL' ? 'yellow' : 'gray'}
        size="lg"
        onClick={() => onSelect('CANCEL')}
        className={clsx(btnClassName, 'rounded-l-none rounded-r-xl')}
      >
        N/A
      </Button>
    </Row>
  )
}
