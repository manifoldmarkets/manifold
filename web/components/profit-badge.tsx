import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'
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
    ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300'
    : 'bg-scarlet-500/20 text-scarlet-600 dark:text-scarlet-200'
  const rounded = round ? Math.round(profitPercent) : profitPercent.toFixed(1)
  return (
    <span
      className={clsx(
        'ml-1 inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium',
        colors,
        className
      )}
    >
      {rounded == 0 ? '' : (profitPercent > 0 ? '+' : '') + rounded + '%'}
    </span>
  )
}

export function ProfitBadgeMana(props: {
  amount: number
  gray?: boolean
  className?: string
}) {
  const { amount, gray, className } = props
  const colors = gray
    ? 'bg-ink-100 text-ink-700'
    : amount > 0
    ? 'bg-ink-100 text-teal-700'
    : 'bg-ink-100 text-scarlet-600'

  const formatted =
    ENV_CONFIG.moneyMoniker + (amount > 0 ? '+' : '') + amount.toFixed(0)

  return (
    <span
      className={clsx(
        'ml-1 inline-flex items-center rounded-full px-3 py-0.5 text-sm font-medium',
        colors,
        className
      )}
    >
      {formatted}
    </span>
  )
}
