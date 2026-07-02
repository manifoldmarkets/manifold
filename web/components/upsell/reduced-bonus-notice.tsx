import clsx from 'clsx'
import Link from 'next/link'
import { ShieldCheckIcon } from '@heroicons/react/solid'

import { formatMoney } from 'common/util/format'
import {
  TIER_BENEFITS,
  EFFECTIVE_TIER_LABELS,
  EffectiveTier,
} from 'common/supporter-config'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'

// Rendered alongside a bonus the user just received (or is about to receive)
// when their effective tier is reducing the amount. Shows "+X (verified users
// get +Y)" with verify/subscribe CTAs. Renders nothing for verified+ tiers.
//
// Use the `kind` prop to pull the right multiplier off TIER_BENEFITS — keeps
// the comparison honest if multipliers are ever tuned.
export function ReducedBonusNotice(props: {
  tier: EffectiveTier
  kind: 'quest' | 'streak' | 'referral'
  earned: number
  className?: string
}) {
  const { tier, kind, earned, className } = props
  const user = useUser()
  const isDenied = user?.bonusEligibility === 'ineligible'
  const isFlagged = user?.bonusEligibility === 'requires_verification'

  // 'restricted' = admin-flagged (earns zero); 'unverified' = reduced. Render
  // for both; verified+ tiers get nothing.
  if (tier !== 'unverified' && tier !== 'restricted') return null

  const verifiedMultiplier =
    kind === 'quest'
      ? TIER_BENEFITS.verified.questMultiplier
      : kind === 'streak'
      ? TIER_BENEFITS.verified.streakMultiplier
      : TIER_BENEFITS.verified.referralMultiplier

  const unverifiedMultiplier =
    kind === 'quest'
      ? TIER_BENEFITS.unverified.questMultiplier
      : kind === 'streak'
      ? TIER_BENEFITS.unverified.streakMultiplier
      : TIER_BENEFITS.unverified.referralMultiplier

  // Back out the base from the earned amount, then project forward to verified.
  // If multipliers are 0 (referral), fall back to a static message.
  const verifiedAmount =
    unverifiedMultiplier > 0
      ? Math.floor((earned / unverifiedMultiplier) * verifiedMultiplier)
      : 0

  // Admin-flagged users earn ZERO bonuses until they complete verification —
  // distinct from the reduced-bonus (unverified) case. Make the flag visible
  // and route them straight to verification.
  if (isFlagged) {
    return (
      <Row
        className={clsx(
          className,
          'items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200'
        )}
      >
        <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span className="flex-1">
          Your account is flagged for verification, so new bonuses are paused.{' '}
          <Link
            href="/membership"
            className="font-semibold text-amber-800 hover:underline dark:text-amber-200"
            onClick={() =>
              track('reduced bonus notice: verify clicked (flagged)', { kind })
            }
          >
            Verify your identity
          </Link>{' '}
          to restore them, or email{' '}
          <a
            href="mailto:info@manifold.markets"
            className="font-semibold text-amber-800 hover:underline dark:text-amber-200"
          >
            info@manifold.markets
          </a>{' '}
          if you think this is a mistake.
        </span>
      </Row>
    )
  }

  // Failed-KYC users can't re-verify through the standard flow — point them
  // at support instead of a verify button that would dead-end.
  if (isDenied) {
    return (
      <Row
        className={clsx(
          className,
          'border-scarlet-200 bg-scarlet-50 text-ink-700 items-start gap-2 rounded-md border p-2 text-xs'
        )}
      >
        <ShieldCheckIcon className="text-scarlet-500 mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1">
          You got {formatMoney(earned)} — your account isn't eligible for the
          full bonus.{' '}
          <Link
            href="/membership"
            className="text-primary-700 font-semibold hover:underline"
            onClick={() =>
              track('reduced bonus notice: subscribe clicked (denied)', {
                kind,
              })
            }
          >
            Subscribe
          </Link>{' '}
          to unlock full bonuses, or email{' '}
          <a
            href="mailto:info@manifold.markets"
            className="text-primary-700 font-semibold hover:underline"
          >
            info@manifold.markets
          </a>{' '}
          if you think this is a mistake.
        </span>
      </Row>
    )
  }

  return (
    <Row
      className={clsx(
        className,
        'border-primary-200 bg-primary-50 text-ink-700 items-start gap-2 rounded-md border p-2 text-xs'
      )}
    >
      <ShieldCheckIcon className="text-primary-500 mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">
        You got {formatMoney(earned)} — this is reduced because your account is
        unverified.{' '}
        {verifiedAmount > earned ? (
          <>
            <span className="font-semibold">
              {EFFECTIVE_TIER_LABELS.verified} users earn{' '}
              {formatMoney(verifiedAmount)}.
            </span>{' '}
          </>
        ) : null}
        <Link
          href="/membership"
          className="text-primary-700 font-semibold hover:underline"
          onClick={() =>
            track('reduced bonus notice: verify clicked', { kind })
          }
        >
          Verify
        </Link>
        ,{' '}
        <Link
          href="/checkout"
          className="text-primary-700 font-semibold hover:underline"
          onClick={() =>
            track('reduced bonus notice: buy mana clicked', { kind })
          }
        >
          buy mana
        </Link>
        , or{' '}
        <Link
          href="/membership"
          className="text-primary-700 font-semibold hover:underline"
          onClick={() =>
            track('reduced bonus notice: subscribe clicked', { kind })
          }
        >
          subscribe
        </Link>{' '}
        to unlock full bonuses.
      </span>
    </Row>
  )
}
