import { useState } from 'react'
import { ShieldCheckIcon, XCircleIcon } from '@heroicons/react/solid'

import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { User } from 'common/user'

type VerificationRequiredModalProps = {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
  // What the user is trying to do (for messaging)
  action?: 'claim free loan' | 'earn quest rewards' | 'receive bonuses'
}

export function VerificationRequiredModal({
  open,
  setOpen,
  user,
  action = 'receive bonuses',
}: VerificationRequiredModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if user has been explicitly denied (ineligible)
  const isDenied = user.bonusEligibility === 'ineligible'

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
      setError('Failed to start verification. Please try again.')
      track('bonus verification: error', {
        action,
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    track('bonus verification: dismissed', { action, isDenied })
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
}: {
  onClose: () => void
  onVerify: () => void
  loading: boolean
  error: string | null
  action: string
}) {
  return (
    <>
      <ShieldCheckIcon className="text-primary-500 mx-auto h-16 w-16" />
      <div className="text-primary-700 text-center text-2xl font-semibold">
        Verification Required
      </div>
      <div className="text-ink-600 text-center">
        To {action}, please verify your identity. This helps us ensure fair play
        and prevents fraud.
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
        Unfortunately, you are not eligible to {action}. This may be due to a
        previous verification attempt that was unsuccessful.
      </div>
      <div className="text-ink-500 mt-2 text-center text-sm">
        If you believe this is an error, please contact support.
      </div>
      <Button onClick={onClose} color="gray" className="mt-4 w-full">
        Close
      </Button>
    </>
  )
}
