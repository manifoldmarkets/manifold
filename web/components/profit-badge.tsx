import clsx from 'clsx'
import { ENV_CONFIG } from 'common/envs/constants'

export function ProfitBadge(props: {
  profitPercent: number
  round?: boolean
  className?: string
}) {
  const { profitPercent, round, className } = props
  if (!profitPercent) return null
  const colors =
    profitPercent > 0
      ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300'
      : 'bg-scarlet-500/20 text-scarlet-600 dark:text-scarlet-200'

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
