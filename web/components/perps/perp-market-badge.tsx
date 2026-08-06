import clsx from 'clsx'

export const PERP_MARKET_BADGE_CLASS =
  'border-primary-300 bg-primary-100 text-primary-700 dark:border-primary-600 dark:bg-primary-900/40 dark:text-white inline-flex h-5 shrink-0 items-center justify-center rounded-md border px-1.5 text-[11px] font-semibold leading-none'

export function PerpMarketBadge(props: { className?: string }) {
  const { className } = props

  return (
    <span className={clsx(PERP_MARKET_BADGE_CLASS, className)}>Perpetual</span>
  )
}
