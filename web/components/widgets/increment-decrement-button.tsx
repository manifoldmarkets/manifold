import clsx from 'clsx'
import { Col } from '../layout/col'

export const IncrementDecrementButton = (props: {
  amount: number
  onIncrement: () => void
  onDecrement: () => void
}) => {
  const { amount, onIncrement, onDecrement } = props
  const buttonClasses =
    'active:bg-ink-100 flex h-6 w-12 flex-row items-center justify-center'
  return (
    <Col className="text-ink-600 relative items-center">
      <button className={clsx(buttonClasses, '')} onClick={onIncrement}>
        <div className="pb-2">+</div>
      </button>
      <span className="pointer-events-none absolute top-[50%] -translate-y-[40%] transform text-xs">
        {amount}
      </span>
      <button
        className={clsx(buttonClasses, 'shadow-sm')}
        onClick={onDecrement}
      >
        <div className="pt-2">-</div>
      </button>
    </Col>
  )
}
