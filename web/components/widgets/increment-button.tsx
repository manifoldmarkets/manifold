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
