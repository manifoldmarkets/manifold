import clsx from 'clsx'

export function PerpMarketBadge(props: {
  className?: string
  label?: 'Perp' | 'Perpetual'
}) {
  const { className, label = 'Perp' } = props

  return (
    <span
      className={clsx(
        'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 inline-flex shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase',
        className
      )}
      title="Perpetual market"
    >
      {label}
    </span>
  )
}
