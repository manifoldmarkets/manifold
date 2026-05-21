import { useState } from 'react'
import { ShieldCheckIcon, XIcon } from '@heroicons/react/solid'

import { canReceiveBonuses, User } from 'common/user'
import { STARTING_BALANCE } from 'common/economy'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export const VerifyPhoneNumberBanner = (props: {
  user: User | null | undefined
  // When false, the X dismiss button is hidden and the global dismiss
  // cooldown is ignored — use this on high-intent surfaces (e.g. /membership,
  // /prize) where the verify prompt should always be visible.
  dismissible?: boolean
}) => {
  const { dismissible = true } = props
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

  if (
    !user ||
    canReceiveBonuses(user) ||
    user.bonusEligibility === 'ineligible'
  )
    return null

  if (dismissible) {
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
      setError('Failed to start verification. Please try again.')
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
    <Col className="from-primary-100 to-primary-50 border-primary-300 relative rounded-lg border bg-gradient-to-r p-4">
      {dismissible && (
        <button
          onClick={handleDismiss}
          className="text-primary-400 hover:text-primary-600 absolute right-1 top-1 p-1 opacity-30 transition-opacity hover:opacity-60"
          aria-label="Dismiss"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
      <Row className="items-center gap-3">
        <ShieldCheckIcon className="text-primary-600 hidden h-10 w-10 shrink-0 sm:block" />
        <Col className="flex-1 gap-1">
          <div className="text-ink-900 text-lg font-semibold">
            Verify your identity to get {formatMoney(STARTING_BALANCE, 'MANA')}
          </div>
          <div className="text-ink-600 text-sm">
            Complete a quick identity check (~2 min) to unlock your full
            starting bonus.
          </div>
          {error && <div className="text-scarlet-500 text-sm">{error}</div>}
        </Col>
        <Button onClick={handleVerify} loading={loading} className="shrink-0">
          Verify now
        </Button>
      </Row>
    </Col>
  )
}
