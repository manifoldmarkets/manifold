import { useState } from 'react'
import { ShieldCheckIcon, XCircleIcon } from '@heroicons/react/solid'

import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { api, APIError } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { User } from 'common/user'

type VerificationRequiredModalProps = {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
  // What the user is trying to do (for messaging). Defaults to
  // 'earn full bonuses' — under the unverified-tier model, unverified
  // users already receive reduced bonuses, so the verify CTA is about
  // unlocking the full amount, not enabling bonuses at all.
  action?: 'claim free loan' | 'earn full bonuses' | 'enter prize drawings'
}

export function VerificationRequiredModal({
  open,
  setOpen,
  user,
  action = 'earn full bonuses',
}: VerificationRequiredModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if user has been explicitly denied (ineligible)
  const isDenied = user.bonusEligibility === 'ineligible'
  // User has been actively flagged for required verification (suspected alt,
  // suspicious signup, manual review). Distinct from the default unverified
  // state — show different copy so they understand this is a system action,
  // not just a missing-step prompt.
  const isFlagged = user.bonusEligibility === 'requires_verification'

  const handleVerify = async () => {
    setLoading(true)
    setError(null)

    try {
      track('bonus verification: started', { action })
      const response = await api('create-idenfy-session', {})
      // Redirect to iDenfy verification page
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError(
        e instanceof APIError && e.code === 503
          ? e.message
          : 'Failed to start verification. Please try again.'
      )
      track('bonus verification: error', {
        action,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    track('bonus verification: dismissed', { action, isDenied, isFlagged })
    setOpen(false)
  }

  return (
    <Modal open={open} setOpen={handleClose} size="sm">
      <Col className={MODAL_CLASS}>
        {isDenied ? (
          <DeniedContent onClose={handleClose} action={action} />
        ) : (
          <VerifyContent
            onClose={handleClose}
            onVerify={handleVerify}
            loading={loading}
            error={error}
            action={action}
            isFlagged={isFlagged}
          />
        )}
      </Col>
    </Modal>
  )
}

function VerifyContent({
  onClose,
  onVerify,
  loading,
  error,
  action,
  isFlagged = false,
}: {
  onClose: () => void
  onVerify: () => void
  loading: boolean
  error: string | null
  action: string
  isFlagged?: boolean
}) {
  return (
    <>
      <ShieldCheckIcon className="text-primary-500 mx-auto h-16 w-16" />
      <div className="text-primary-700 text-center text-2xl font-semibold">
        {isFlagged ? 'Verification Needed' : 'Verification Required'}
      </div>
      <div className="text-ink-600 text-center">
        {isFlagged
          ? `Your account has been flagged for review. To ${action}, please complete identity verification. If verification succeeds, your bonus eligibility will be reinstated.`
          : `To ${action}, please verify your identity. This helps us ensure fair play and prevents fraud.`}
      </div>
      <div className="text-ink-500 mt-2 text-center text-sm">
        Verification takes about 2 minutes and requires a valid ID.
      </div>
      {error && (
        <div className="text-scarlet-500 mt-2 text-center text-sm">{error}</div>
      )}
      <Row className="mt-4 w-full gap-3">
        <Button
          onClick={onClose}
          color="gray-outline"
          className="flex-1"
          disabled={loading}
        >
          Maybe Later
        </Button>
        <Button
          onClick={onVerify}
          className="flex-1"
          loading={loading}
          disabled={loading}
        >
          Verify Now
        </Button>
      </Row>
    </>
  )
}

function DeniedContent({
  onClose,
  action,
}: {
  onClose: () => void
  action: string
}) {
  return (
    <>
      <XCircleIcon className="text-scarlet-500 mx-auto h-16 w-16" />
      <div className="text-scarlet-600 text-center text-2xl font-semibold">
        Not Eligible
      </div>
      <div className="text-ink-600 text-center">
        A previous verification attempt was unsuccessful, so you can't {action}{' '}
        on this account.
      </div>
      <div className="text-ink-500 mt-2 text-center text-sm">
        If you believe this is a mistake, email{' '}
        <a
          href="mailto:info@manifold.markets"
          className="text-primary-700 font-semibold hover:underline"
        >
          info@manifold.markets
        </a>{' '}
        and our team can re-enable verification for you.
      </div>
      <Button onClick={onClose} color="gray" className="mt-4 w-full">
        Close
      </Button>
    </>
  )
}
