import { ShieldCheckIcon, XCircleIcon } from '@heroicons/react/solid'

import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { useStartIdentityVerification } from 'web/hooks/use-start-identity-verification'
import { track } from 'web/lib/service/analytics'
import { User } from 'common/user'

type VerificationRequiredModalProps = {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
  // What the user is trying to do (for messaging). Verification is optional
  // everywhere except prize drawings; the loan prompt only reaches accounts an
  // admin has flagged for verification or blocked from bonuses.
  action: 'claim free loan' | 'enter prize drawings'
}

export function VerificationRequiredModal({
  open,
  setOpen,
  user,
  action,
}: VerificationRequiredModalProps) {
  const { start, loading, error } = useStartIdentityVerification(
    'bonus verification: started',
    { action }
  )

  // Verifying can't help: prize access was explicitly revoked (a failed
  // iDenfy check or an admin), or, for loans, an admin/superban bonus block —
  // which approval deliberately leaves in place.
  const isUnavailable =
    action === 'enter prize drawings'
      ? user.prizeEligibility === 'ineligible'
      : user.bonusEligibility === 'ineligible'
  // User has been actively flagged for required verification (suspected alt,
  // suspicious signup, manual review) — show different copy so they understand
  // this is a system action, not just a missing-step prompt.
  const isFlagged = user.bonusEligibility === 'requires_verification'

  const handleClose = () => {
    track('bonus verification: dismissed', {
      action,
      isUnavailable,
      isFlagged,
    })
    setOpen(false)
  }

  return (
    <Modal open={open} setOpen={handleClose} size="sm">
      <Col className={MODAL_CLASS}>
        {isUnavailable ? (
          <UnavailableContent onClose={handleClose} action={action} />
        ) : (
          <VerifyContent
            onClose={handleClose}
            onVerify={start}
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

function UnavailableContent({
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
        You can't {action} on this account.
      </div>
      <div className="text-ink-500 mt-2 text-center text-sm">
        If you believe this is a mistake, email{' '}
        <a
          href="mailto:info@manifold.markets"
          className="text-primary-700 font-semibold hover:underline"
        >
          info@manifold.markets
        </a>{' '}
        and our team will take a look.
      </div>
      <Button onClick={onClose} color="gray" className="mt-4 w-full">
        Close
      </Button>
    </>
  )
}
