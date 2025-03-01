import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

import { resolution } from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { capitalize } from 'lodash'
import { Button } from '../buttons/button'
import { Row } from '../layout/row'

export function YesNoSelector(props: {
  selected?: 'YES' | 'NO'
  onSelect: (selected: 'YES' | 'NO') => void
  className?: string
  btnClassName?: string
  yesLabel?: string
  noLabel?: string
  disabled?: boolean
  highlight?: boolean
  includeWordBet?: boolean
}) {
  const {
    selected,
    onSelect,
    className,
    btnClassName,
    yesLabel,
    noLabel,
    disabled,
    highlight,
    includeWordBet,
  } = props

  return (
    <Row className={clsx('space-x-3', className)}>
      <Button
        color={'green'}
        size="xl"
        onClick={() => onSelect('YES')}
        className={clsx(
          btnClassName,
          selected === 'YES' && 'opacity-75',
          selected !== undefined ? '!rounded-full' : ''
        )}
        disabled={disabled}
      >
        {includeWordBet ? capitalize(TRADE_TERM) : ''}{' '}
        {yesLabel ? yesLabel : 'YES'}
        <ArrowUpIcon className="ml-1 h-4 w-4" />
      </Button>

      <Button
        color={'red'}
        size="xl"
        onClick={() => onSelect('NO')}
        className={clsx(
          btnClassName,
          selected === 'NO' && 'opacity-75',
          selected !== undefined ? '!rounded-full' : ''
        )}
        disabled={disabled}
      >
        {includeWordBet ? capitalize(TRADE_TERM) : ''}{' '}
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
  const { selected, onSelect, className } = props
  const btnClassName = clsx(
    '!py-2 flex-1 first:rounded-l-xl last:rounded-r-xl rounded-r-none rounded-l-none whitespace-nowrap',
    className
  )

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
        PARTIAL %
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
  selected: 'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  onSelect: (selected: 'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL') => void
}) {
  const { selected, onSelect } = props

  const btnClassName =
    '!py-2 flex-1 sm:first:rounded-l-xl sm:last:rounded-r-xl sm:rounded-none whitespace-nowrap'

  return (
    <div className="flex flex-col gap-1 sm:flex-row">
      <Button
        color={selected === 'CHOOSE_ONE' ? 'green' : 'gray'}
        size="lg"
        onClick={() => onSelect('CHOOSE_ONE')}
        className={btnClassName}
      >
        Choose one
      </Button>
      <Button
        color={selected === 'CHOOSE_MULTIPLE' ? 'blue' : 'gray'}
        size="lg"
        onClick={() => onSelect('CHOOSE_MULTIPLE')}
        className={btnClassName}
      >
        Choose many
      </Button>
      <Button
        color={selected === 'CANCEL' ? 'yellow' : 'gray'}
        size="lg"
        onClick={() => onSelect('CANCEL')}
        className={btnClassName}
      >
        N/A
      </Button>
    </div>
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
