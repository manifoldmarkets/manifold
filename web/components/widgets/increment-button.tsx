import clsx from 'clsx'
import { Col } from '../layout/col'

export const IncrementButton = (props: {
  amount: number
  onIncrement: () => void
}) => {
  const { amount, onIncrement } = props
  return (
    <button
      className={clsx(
        'text-ink-500 active:bg-ink-100 active:text-ink-600 hover:text-ink-600 flex h-[54px] w-12 flex-row items-center justify-center'
      )}
      onClick={onIncrement}
    >
      <div className="pointer-events-none text-xs">+{amount}</div>
    </button>
  )
}

export const IncrementDecrementButton = (props: {
  onIncrement: () => void
  onDecrement: () => void
}) => {
  const { onIncrement, onDecrement } = props

  return (
    <Col>
      <button
        className={clsx(
          'text-ink-500 active:bg-ink-100 active:text-ink-600 hover:text-ink-600 flex h-7 w-12 flex-row items-center justify-center'
        )}
        onClick={onIncrement}
      >
        <div className="pointer-events-none text-xs">+</div>
      </button>
      <button
        className={clsx(
          'text-ink-500 active:bg-ink-100 active:text-ink-600 hover:text-ink-600 flex h-7 w-12 flex-row items-center justify-center'
        )}
        onClick={onDecrement}
      >
        <div className="pointer-events-none text-xs">-</div>
      </button>
    </Col>
  )
}

const buttonClasses =
  'text-ink-400 flex h-[35px] w-12 flex-row items-center justify-center active:bg-ink-100'
export const IncrementDecrementAmountButton = (props: {
  amount: number
  incrementBy: (amount: number) => void
}) => {
  const { amount, incrementBy } = props

  return (
    <Col className="divide-ink-300 mt-[1px] divide-y text-xs">
      <button
        className={clsx(buttonClasses, '')}
        onClick={() => incrementBy(amount)}
      >
        +{amount}
      </button>
      <button
        className={clsx(buttonClasses, '')}
        onClick={() => incrementBy(-amount)}
      >
        -{amount}
      </button>
    </Col>
  )
}
