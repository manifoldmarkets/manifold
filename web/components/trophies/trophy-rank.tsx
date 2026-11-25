import clsx from 'clsx'
import { ReactNode } from 'react'

import {
  TrophyDefinition,
  TrophyRankTier,
  formatTrophyValue,
  getTrophyRankTitle,
} from 'common/trophies'
import { Tooltip } from 'web/components/widgets/tooltip'

const rankRing = (tier: TrophyRankTier) =>
  tier === 'super'
    ? 'ring-slate-400 dark:ring-slate-300'
    : 'ring-amber-500 dark:ring-amber-400'

export function formatRankValue(def: TrophyDefinition, value: number) {
  return (def.id === 'net-worth' ? 'M' : '') + formatTrophyValue(def, value)
}

export function TrophyRankChip(props: {
  definition: TrophyDefinition
  tier: TrophyRankTier
  rank: number
  value: number
  computedTime: number | null
  hideScore?: boolean
}) {
  const { definition, tier, rank, value, computedTime, hideScore } = props
  const title = getTrophyRankTitle(definition, tier)
  const score = formatRankValue(definition, value)
  const updated =
    computedTime == null
      ? ''
      : ` · Updated ${new Date(computedTime).toLocaleString()}`
  const description = `${title} · ${definition.label} · #${rank} · ${score}. ${definition.rankNote}${updated}`
  return (
    <Tooltip text={description} showOnFocus>
      <button
        type="button"
        aria-label={description}
        className={clsx(
          'bg-canvas-50 text-ink-800 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
          hideScore && 'whitespace-nowrap',
          rankRing(tier)
        )}
      >
        {tier === 'crown' && (
          <span aria-hidden className="mr-1">
            👑
          </span>
        )}
        {title}
        {!hideScore && ` · ${score}`}
        {tier !== 'crown' && ` · #${rank}`}
      </button>
    </Tooltip>
  )
}

// Held ranks decorate the badge without introducing another milestone colour.
export function TrophyRankRing(props: {
  tier: TrophyRankTier | null | undefined
  small?: boolean
  children: ReactNode
}) {
  const { tier, small, children } = props
  if (!tier) return <>{children}</>
  return (
    <span
      className={clsx(
        'relative inline-flex items-center justify-center rounded-full ring-2',
        rankRing(tier)
      )}
    >
      {children}
      {tier === 'crown' && (
        <span
          aria-hidden
          className={clsx(
            'absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 leading-none',
            small ? 'text-xs' : 'text-2xl'
          )}
        >
          👑
        </span>
      )}
    </span>
  )
}
