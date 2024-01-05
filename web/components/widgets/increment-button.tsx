import clsx from 'clsx'

export const IncrementButton = (props: {
  amount: number
  onIncrement: () => void
  hidePlus?: boolean
}) => {
  const { amount, onIncrement, hidePlus } = props
  return (
    <button
      className={clsx(
        'text-ink-500 active:bg-ink-100 active:text-ink-600 hover:text-ink-600 flex h-[54px] w-12 flex-row items-center justify-center'
      )}
      onClick={onIncrement}
    >
      <div className="pointer-events-none text-xs">
        {!hidePlus && '+'}
        {amount}
      </div>
    </button>
  )
}
