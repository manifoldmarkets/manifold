import clsx from 'clsx'
import { ShieldCheckIcon } from '@heroicons/react/solid'

import { EffectiveTier } from 'common/supporter-config'
import { Row } from 'web/components/layout/row'
import { useStartIdentityVerification } from 'web/hooks/use-start-identity-verification'

// Rendered alongside a bonus when the user's effective tier is 'restricted'
// (admin-flagged for verification), which pays zero until they verify. Renders
// nothing for every other tier: verification is optional and never boosts
// bonuses for accounts in good standing.
export function FlaggedBonusNotice(props: {
  tier: EffectiveTier
  kind: 'quest' | 'streak' | 'referral'
  className?: string
}) {
  const { tier, kind, className } = props
  const { start, loading } = useStartIdentityVerification(
    `flagged bonus notice: verify clicked (${kind})`
  )

  if (tier !== 'restricted') return null

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
        <button
          onClick={start}
          disabled={loading}
          className="font-semibold text-amber-800 hover:underline disabled:opacity-50 dark:text-amber-200"
        >
          Verify your identity
        </button>{' '}
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
