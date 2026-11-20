import clsx from 'clsx'
import { ShieldCheckIcon } from '@heroicons/react/solid'

import { isBonusVerificationRequired, User } from 'common/user'
import { isSupporter } from 'common/supporter-config'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { useStartIdentityVerification } from 'web/hooks/use-start-identity-verification'

// Shown only to accounts an admin has flagged for verification
// (bonusEligibility = 'requires_verification'): they earn no bonuses until they
// verify, so the banner is non-dismissible. Everyone else is never prompted to
// verify outside the prize drawing page.
//
// Subscribers are skipped: a subscription already grants full bonuses
// (subscription wins in resolveEffectiveTier). The flag re-surfaces here
// automatically if their subscription lapses.
export const FlaggedAccountBanner = (props: {
  user: User | null | undefined
  className?: string
}) => {
  const { className } = props
  const user = useUser() ?? props.user
  const { start, loading, error } = useStartIdentityVerification(
    'flagged account banner: verify clicked'
  )

  if (
    !user ||
    !isBonusVerificationRequired(user) ||
    isSupporter(user.entitlements)
  )
    return null

  return (
    <Col
      className={clsx(
        'relative rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30',
        className
      )}
    >
      <Row className="items-center gap-2">
        <ShieldCheckIcon className="hidden h-7 w-7 shrink-0 text-amber-500 sm:block" />
        <Col className="flex-1 gap-1">
          <div className="text-ink-900 text-sm font-semibold sm:text-base">
            Your account has been flagged for verification
          </div>
          <div className="text-ink-600 text-xs sm:text-sm">
            You won't receive bonuses until you complete a quick identity check
            (~2 min). Email{' '}
            <a
              href="mailto:info@manifold.markets"
              className="font-semibold hover:underline"
            >
              info@manifold.markets
            </a>{' '}
            if you think this is a mistake.
          </div>
          {error && <div className="text-scarlet-500 text-sm">{error}</div>}
        </Col>
        <Button
          onClick={start}
          loading={loading}
          size="xs"
          className="shrink-0"
        >
          Verify now
        </Button>
      </Row>
    </Col>
  )
}
