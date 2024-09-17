import clsx from 'clsx'
import { Col } from '../layout/col'
import { formatSweepiesNumber, InputTokenType } from 'common/util/format'

export const IncrementButton = (props: {
  amount: number
  onIncrement: () => void
  className?: string
  token?: InputTokenType
}) => {
  const { amount, onIncrement, className, token = 'M$' } = props

  const displayedAmount =
    token === 'CASH' ? formatSweepiesNumber(amount, { short: true }) : amount

  return (
    <button
      className={clsx(
        className,
        'text-ink-500 active:bg-ink-100 active:text-ink-600 hover:text-ink-600 flex  w-12 flex-row items-center justify-center'
      )}
      onClick={onIncrement}
    >
      <div className="pointer-events-none text-xs">+{displayedAmount}</div>
    </button>
  )
}

export const IncrementDecrementButton = (props: {
  onIncrement: () => void
  onDecrement: () => void
  className?: string
}) => {
  const { onIncrement, onDecrement, className } = props

  return (
    <Col className={className}>
      <button
        className={clsx(
          'text-ink-500 active:bg-ink-100 active:text-ink-600 hover:text-ink-600 flex h-[24px] w-12 flex-row items-center justify-center'
        )}
        onClick={onIncrement}
      >
        <div className="pointer-events-none">+</div>
      </button>
      <button
        className={clsx(
          'text-ink-500 active:bg-ink-100 active:text-ink-600 hover:text-ink-600 flex h-[22px] w-12 flex-row items-center justify-center'
        )}
        onClick={onDecrement}
      >
        <div className="pointer-events-none">-</div>
      </button>
    </Col>
  )
}

const buttonClasses =
  'text-ink-400 flex h-[35px] w-12 flex-row items-center justify-center active:bg-ink-100'
export const IncrementDecrementAmountButton = (props: {
  amount: number
  incrementBy: (amount: number) => void
  token: InputTokenType
}) => {
  const { amount, incrementBy, token = 'M$' } = props

  const displayedAmount =
    token === 'CASH' ? formatSweepiesNumber(amount, { short: true }) : amount

  return (
    <Col className="divide-ink-300 mt-[1px] divide-y text-xs">
      <button
        className={clsx(buttonClasses, '')}
        onClick={() => incrementBy(amount)}
      >
        +{displayedAmount}
      </button>
      <button
        className={clsx(buttonClasses, '')}
        onClick={() => incrementBy(-amount)}
      >
        -{displayedAmount}
      </button>
    </Col>
  )
}
