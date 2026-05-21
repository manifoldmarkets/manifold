import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { ShieldCheckIcon } from '@heroicons/react/solid'

import { formatMoney } from 'common/util/format'
import {
  EFFECTIVE_TIER_BONUS_MULTIPLIERS,
  EFFECTIVE_TIER_LABELS,
  EffectiveTier,
} from 'common/supporter-config'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { useUser } from 'web/hooks/use-user'

// Rendered alongside a bonus the user just received (or is about to receive)
// when their effective tier is reducing the amount. Shows "+X (verified users
// get +Y)" with verify/subscribe CTAs. Renders nothing for verified+ tiers.
//
// Use the `kind` prop to pull the right multiplier off
// EFFECTIVE_TIER_BONUS_MULTIPLIERS — keeps the comparison honest if multipliers
// are ever tuned.
export function ReducedBonusNotice(props: {
  tier: EffectiveTier
  kind: 'quest' | 'streak' | 'referral'
  earned: number
  className?: string
}) {
  const { tier, kind, earned, className } = props
  const [loading, setLoading] = useState(false)
  const user = useUser()
  const isDenied = user?.bonusEligibility === 'ineligible'

  if (tier !== 'unverified') return null

  const verifiedMultiplier =
    kind === 'quest'
      ? EFFECTIVE_TIER_BONUS_MULTIPLIERS.verified.questMultiplier
      : kind === 'streak'
      ? EFFECTIVE_TIER_BONUS_MULTIPLIERS.verified.streakMultiplier
      : EFFECTIVE_TIER_BONUS_MULTIPLIERS.verified.referralMultiplier

  const unverifiedMultiplier =
    kind === 'quest'
      ? EFFECTIVE_TIER_BONUS_MULTIPLIERS.unverified.questMultiplier
      : kind === 'streak'
      ? EFFECTIVE_TIER_BONUS_MULTIPLIERS.unverified.streakMultiplier
      : EFFECTIVE_TIER_BONUS_MULTIPLIERS.unverified.referralMultiplier

  // Back out the base from the earned amount, then project forward to verified.
  // If multipliers are 0 (referral), fall back to a static message.
  const verifiedAmount =
    unverifiedMultiplier > 0
      ? Math.floor((earned / unverifiedMultiplier) * verifiedMultiplier)
      : 0

  const handleVerify = async () => {
    setLoading(true)
    try {
      track('reduced bonus notice: verify clicked', { kind })
      const response = await api('create-idenfy-session', {})
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setLoading(false)
    }
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
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
          className="text-primary-700 font-semibold hover:underline disabled:opacity-50"
        >
          Verify
        </button>{' '}
        or{' '}
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
