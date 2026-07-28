import clsx from 'clsx'

export function PerpMarketBadge(props: {
  className?: string
  label?: 'Perpetual'
}) {
  const { className, label } = props

  return (
    <span
      className={clsx(
        'border-primary-300/70 bg-primary-50 text-primary-700 dark:border-primary-700/70 dark:bg-primary-900/40 dark:text-primary-300 inline-flex h-5 shrink-0 items-center justify-center gap-1 rounded-full border font-semibold',
        label ? 'px-1.5 text-[11px]' : 'min-w-5 px-1',
        className
      )}
      title="Perpetual market"
    >
      <span aria-hidden="true" className="-mt-px text-[15px] leading-none">
        ∞
      </span>
      {label ? (
        <span>{label}</span>
      ) : (
        <span className="sr-only">Perpetual market</span>
      )}
    </span>
  )
}
