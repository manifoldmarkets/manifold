import clsx from 'clsx'
const GRAY_COLOR = 'bg-canvas-100 text-ink-500'

export function ProfitBadge(props: {
  profitPercent: number
  round?: boolean
  className?: string
  grayColor?: boolean
}) {
  const { profitPercent, grayColor, round, className } = props
  if (!profitPercent) return null
  const colors = grayColor
    ? GRAY_COLOR
    : profitPercent > 0
    ? 'bg-teal-100 text-teal-700'
    : 'bg-scarlet-100 text-scarlet-700'
  const rounded = round ? Math.round(profitPercent) : profitPercent.toFixed(1)
  if (rounded == 0) return null
  return (
    <span
      className={clsx(
        'ml-1 inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium',
        colors,
        className
      )}
    >
      {(profitPercent > 0 ? '+' : '') + rounded + '%'}
    </span>
  )
}
