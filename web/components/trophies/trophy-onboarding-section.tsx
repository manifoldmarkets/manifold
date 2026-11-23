import Link from 'next/link'

import {
  STARTER_MIN_TRADE_AMOUNT,
  StarterStats,
  TrophyClaim,
  TrophyMilestoneRef,
  getClaimableOnboardingMilestones,
  getNextOnboardingMilestone,
  getTrophyClaimReward,
} from 'common/trophies'
import { formatMoney } from 'common/util/format'
import { Button, buttonClass } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { TrophyBadgeImage } from './trophy-badge-image'
import { TrophyRewardChip } from './trophy-reward-chip'

export function TrophyOnboardingSection(props: {
  starter: StarterStats
  claims: TrophyClaim[]
  rewarded: TrophyMilestoneRef[]
  multiplier: number
  claimingId: string | null
  onClaim: (trophyId: string, milestoneId: string) => void
}) {
  const { starter, claims, rewarded, multiplier, claimingId, onClaim } = props
  const ready = getClaimableOnboardingMilestones(starter, claims)
  const next = ready.length ? null : getNextOnboardingMilestone(starter, claims)
  if (!ready.length && !next) return null

  return (
    <section className="border-ink-200 bg-canvas-0 rounded-xl border px-3 py-3 sm:px-4">
      <h2 className="text-ink-900 text-base font-bold">
        {next ? 'Next trophy' : 'Ready to claim'}
      </h2>
      <ul className="divide-ink-100 divide-y">
        {(next ? [next] : ready).map(({ definition, milestone }) => (
          <li
            key={`${definition.id}/${milestone.id}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
          >
            <span className={next ? 'opacity-50 grayscale' : undefined}>
              <TrophyBadgeImage
                trophyId={definition.id}
                milestone={milestone}
                className="h-12 w-12"
                emojiClassName="text-3xl"
              />
            </span>
            <div className="min-w-28 flex-1">
              <div className="text-ink-900 text-sm font-semibold">
                {milestone.name}
              </div>
              <div className="text-ink-500 text-xs">{definition.label}</div>
              <TrophyRewardChip
                amount={getTrophyClaimReward(
                  definition,
                  milestone,
                  rewarded,
                  multiplier
                )}
              />
            </div>
            {next ? (
              <FindMarketLink source="next trophy" />
            ) : (
              <Button
                size="sm"
                disabled={!!claimingId}
                onClick={() => onClaim(definition.id, milestone.id)}
                aria-label={`Claim ${milestone.name}`}
              >
                Claim
              </Button>
            )}
            {next && (
              <div className="w-full">
                <p className="text-ink-600 text-sm">
                  {getOnboardingHint(next)}
                </p>
                <progress
                  aria-label={`${milestone.name} progress`}
                  value={next.value}
                  max={milestone.threshold}
                  className="accent-primary-500 h-1.5 w-full"
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function getOnboardingHint(
  next: NonNullable<ReturnType<typeof getNextOnboardingMilestone>>
) {
  const remaining = next.milestone.threshold - next.value
  if (next.definition.statKey === 'starterDays') {
    return remaining === 1
      ? 'Trade again on another day'
      : `Trade on ${remaining} more days`
  }
  if (next.definition.statKey === 'starterMarkets') {
    return remaining === 1
      ? 'Trade in one more market'
      : `Trade in ${remaining} more markets`
  }
  const minimum = formatMoney(STARTER_MIN_TRADE_AMOUNT)
  return next.milestone.threshold === 1
    ? `Make a trade of ${minimum} or more`
    : `Make ${remaining} more ${
        remaining === 1 ? 'trade' : 'trades'
      } of ${minimum} or more, counting each market once per day`
}

export function FindMarketLink(props: { source: 'next trophy' | 'explainer' }) {
  return (
    <Link
      href="/home"
      className={buttonClass('sm', 'indigo')}
      onClick={() =>
        track('trophies find a market clicked', { source: props.source })
      }
    >
      Find a market
    </Link>
  )
}
