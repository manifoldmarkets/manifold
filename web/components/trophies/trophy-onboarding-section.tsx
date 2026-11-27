import Link from 'next/link'

import {
  StarterStats,
  TrophyClaim,
  TrophyMilestoneRef,
  TrophyPrizeAccount,
  getClaimableOnboardingMilestones,
  getNextOnboardingMilestone,
  getOwnMilestonePrize,
  getStarterMilestoneHint,
} from 'common/trophies'
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
  const hint = next && getStarterMilestoneHint(next)

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
                  prize={getOwnMilestonePrize(
                    definition,
                    milestone,
                    rewarded,
                    prizeAccount
                  )}
                />
              )}
            </div>
            {hint ? (
              <Link
                href={hint.href}
                className={buttonClass('sm', 'indigo')}
                onClick={() =>
                  track('trophies find a market clicked', {
                    source: 'next trophy',
                    trophyId: definition.id,
                    href: hint.href,
                  })
                }
              >
                {hint.cta}
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
            {next && hint && (
              <div className="w-full">
                <p className="text-ink-600 text-sm">{hint.text}</p>
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
