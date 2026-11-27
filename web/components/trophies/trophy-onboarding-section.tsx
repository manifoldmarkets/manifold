import Link from 'next/link'

import {
  STARTER_MIN_TRADE_AMOUNT,
  StarterStats,
  TrophyClaim,
  TrophyMilestoneRef,
  TrophyPrizeAccount,
  getClaimableOnboardingMilestones,
  getNextOnboardingMilestone,
  getTrophyClaimPrize,
} from 'common/trophies'
import { formatMoney } from 'common/util/format'
import { Button, buttonClass } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { TrophyBadgeImage } from './trophy-badge-image'
import { TrophyPrizeChip } from './trophy-prize-chip'

export function TrophyOnboardingSection(props: {
  starter: StarterStats
  claims: TrophyClaim[]
  rewarded: TrophyMilestoneRef[]
  // The account's standing, to show what each milestone pays it.
  prizeAccount: TrophyPrizeAccount | undefined
  claimingId: string | null
  onClaim: (trophyId: string, milestoneId: string) => void
}) {
  const { starter, claims, rewarded, prizeAccount, claimingId, onClaim } = props
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
              {prizeAccount && (
                <TrophyPrizeChip
                  className="mt-0.5"
                  prize={getTrophyClaimPrize(
                    definition,
                    milestone,
                    rewarded,
                    prizeAccount
                  )}
                />
              )}
            </div>
            {next ? (
              <Link
                href="/home"
                className={buttonClass('sm', 'indigo')}
                onClick={() =>
                  track('trophies find a market clicked', {
                    source: 'next trophy',
                  })
                }
              >
                Find a market
              </Link>
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

function getOnboardingHint(
  next: NonNullable<ReturnType<typeof getNextOnboardingMilestone>>
) {
  const remaining = next.milestone.threshold - next.value
  const minimum = `${formatMoney(STARTER_MIN_TRADE_AMOUNT)} or more`
  if (next.definition.statKey === 'starterDays') {
    return remaining === 1
      ? `Trade ${minimum} on another day`
      : `Trade ${minimum} on ${remaining} more days`
  }
  if (next.definition.statKey === 'starterMarkets') {
    return remaining === 1
      ? `Trade ${minimum} in one more market`
      : `Trade ${minimum} in ${remaining} more markets`
  }
  return next.milestone.threshold === 1
    ? `Make a trade of ${minimum}`
    : `Make ${remaining} more ${
        remaining === 1 ? 'trade' : 'trades'
      } of ${minimum}, one per market per day`
}
