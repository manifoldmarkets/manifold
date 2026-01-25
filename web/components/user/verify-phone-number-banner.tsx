/**
 * @deprecated Phone verification has been replaced by iDenfy identity verification.
 * This component is kept for backwards compatibility but should not be used.
 * Use the identity verification flow in the welcome modal instead.
 */

import { canReceiveBonuses, User } from 'common/user'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { useUser } from 'web/hooks/use-user'

/**
 * @deprecated Phone verification is no longer available.
 */
export const VerifyPhoneNumberBanner = (props: {
  user: User | null | undefined
}) => {
  const user = useUser() ?? props.user

  // Don't show the banner - phone verification is deprecated
  // Users should use identity verification instead
  if (!user || canReceiveBonuses(user)) return null

  // Return null - identity verification is now handled in the welcome/onboarding flow
  return null
}

/**
 * @deprecated Phone verification is no longer available.
 */
export const VerifyPhoneModal = (props: {
  open: boolean
  setOpen: (open: boolean) => void
}) => {
  const { open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={'bg-canvas-0 p-4'}>
        <div className="text-ink-600 text-center">
          Phone verification is no longer available. Please use identity
          verification instead.
        </div>
      </Col>
    </Modal>
  )
}
