import clsx from 'clsx'

export function ProfitBadge(props: {
  profitPercent: number
  round?: boolean
  className?: string
}) {
  const { profitPercent, round, className } = props
  if (!profitPercent) return null
  const colors =
    profitPercent > 0
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800'

  return (
    <span
      className={clsx(
        'ml-1 inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium',
        colors,
        className
      )}
    >
      {(profitPercent > 0 ? '+' : '') +
        profitPercent.toFixed(round ? 0 : 1) +
        '%'}
    </span>
  )
}
