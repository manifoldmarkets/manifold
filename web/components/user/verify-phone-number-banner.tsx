import { useState } from 'react'
import clsx from 'clsx'
import { ShieldCheckIcon, XIcon } from '@heroicons/react/solid'

import { isIdentityVerified, User } from 'common/user'
import { isSupporter } from 'common/supporter-config'
import { STARTING_BALANCE } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export const VerifyPhoneNumberBanner = (props: {
  user: User | null | undefined
  // When false, the X dismiss button is hidden and the global dismiss
  // cooldown is ignored — use this on high-intent surfaces (e.g. /membership,
  // /prize) where the verify prompt should always be visible.
  dismissible?: boolean
  // Tighter padding, smaller text and icon — for surfaces where the banner
  // sits alongside other content and shouldn't dominate vertical space.
  compact?: boolean
}) => {
  const { dismissible = true, compact = false } = props
  const user = useUser() ?? props.user
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissCount, setDismissCount] = usePersistentLocalState(
    0,
    'verify-banner-dismiss-count'
  )
  const [dismissedAt, setDismissedAt] = usePersistentLocalState(
    0,
    'verify-banner-dismissed-at'
  )

  // Gate on identity verification, not full bonus access: bonus-'eligible'
  // purchasers haven't done KYC, so the M500 verify offer is still genuine for
  // them and nudges them toward the prize-drawing-enabling identity check.
  //
  // Subscribers are never shown verification prompts: a subscription already
  // grants full bonuses (subscription wins in resolveEffectiveTier), so a
  // subscribed user — including a subscribed flagged user — is treated as a
  // subscriber, not a flagged/unverified one. The flag re-surfaces here
  // automatically if their subscription lapses.
  if (
    !user ||
    isIdentityVerified(user) ||
    user.bonusEligibility === 'ineligible' ||
    isSupporter(user.entitlements)
  )
    return null

  const isFlagged = user.bonusEligibility === 'requires_verification'

  // Flagged users earn ZERO bonuses until they verify, so the banner is
  // force-shown — bypassing the dismiss cooldown so a previously-dismissed
  // banner re-appears the moment they're flagged.
  if (dismissible && !isFlagged) {
    const hoursSinceDismiss = (Date.now() - dismissedAt) / (1000 * 60 * 60)
    const cooldownHours = Math.min(dismissCount * 2, 24)
    if (dismissedAt > 0 && hoursSinceDismiss < cooldownHours) return null
  }

  const handleVerify = async () => {
    setLoading(true)
    setError(null)
    try {
      track('profile verification banner: clicked')
      const response = await api('create-idenfy-session', {})
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError(
        e instanceof APIError && e.code === 503
          ? e.message
          : 'Failed to start verification. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    track('profile verification banner: dismissed', { dismissCount })
    setDismissCount(dismissCount + 1)
    setDismissedAt(Date.now())
  }

  return (
    <Col
      className={clsx(
        'from-primary-100 to-primary-50 border-primary-300 relative rounded-lg border bg-gradient-to-r',
        compact ? 'p-3' : 'p-4'
      )}
    >
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="text-primary-400 hover:text-primary-600 absolute right-1 top-1 p-1 opacity-30 transition-opacity hover:opacity-60"
          aria-label="Dismiss"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <Row className={clsx('items-center', compact ? 'gap-2' : 'gap-3')}>
        <ShieldCheckIcon
          className={clsx(
            'text-primary-600 hidden shrink-0 sm:block',
            compact ? 'h-7 w-7' : 'h-10 w-10'
          )}
        />
        <Col className="flex-1 gap-1">
          <div
            className={clsx(
              'text-ink-900 font-semibold',
              compact ? 'text-sm sm:text-base' : 'text-lg'
            )}
          >
            {isFlagged
              ? 'Your account has been flagged for verification'
              : `Verify your identity to get ${formatMoney(
                  STARTING_BALANCE,
                  'MANA'
                )}`}
          </div>
          <div
            className={clsx(
              'text-ink-600',
              compact ? 'text-xs sm:text-sm' : 'text-sm'
            )}
          >
            {isFlagged
              ? "You won't receive bonuses until you complete a quick identity check (~2 min)."
              : 'Complete a quick identity check (~2 min) to unlock your full starting bonus.'}
          </div>
          {error && <div className="text-scarlet-500 text-sm">{error}</div>}
        </Col>
        <Button
          onClick={handleVerify}
          loading={loading}
          size={compact ? 'xs' : undefined}
          className="shrink-0"
        >
          Verify now
        </Button>
      </Row>
    </Col>
  )
}
