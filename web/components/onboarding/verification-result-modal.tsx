import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/solid'

import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'

type VerificationResult = 'approved' | 'denied' | 'unverified' | null

export function VerificationResultModal() {
  const router = useRouter()
  const [result, setResult] = useState<VerificationResult>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Check for verification result query params
    const hasApproved = 'approved' in router.query
    const hasDenied = 'denied' in router.query
    const hasUnverified = 'unverified' in router.query

    if (hasApproved) {
      setResult('approved')
      setOpen(true)
      track('identity verification result: approved')
    } else if (hasDenied) {
      setResult('denied')
      setOpen(true)
      track('identity verification result: denied')
    } else if (hasUnverified) {
      setResult('unverified')
      setOpen(true)
      track('identity verification result: unverified')
    }
  }, [router.query])

  const handleClose = () => {
    setOpen(false)
    // Remove query params from URL without refreshing
    const { approved, denied, unverified, ...rest } = router.query
    router.replace(
      {
        pathname: router.pathname,
        query: rest,
      },
      undefined,
      { shallow: true }
    )
  }

  if (!result) return null

  return (
    <Modal open={open} setOpen={handleClose} size="sm">
      <Col className={MODAL_CLASS}>
        {result === 'approved' && <ApprovedContent onClose={handleClose} />}
        {result === 'denied' && <DeniedContent onClose={handleClose} />}
        {result === 'unverified' && <UnverifiedContent onClose={handleClose} />}
      </Col>
    </Modal>
  )
}

function ApprovedContent({ onClose }: { onClose: () => void }) {
  return (
    <>
      <CheckCircleIcon className="text-teal-500 mx-auto h-16 w-16" />
      <div className="text-primary-700 text-center text-2xl font-semibold">
        Identity Verified!
      </div>
      <div className="text-ink-600 text-center">
        Your identity has been successfully verified. Thank you for helping keep
        Manifold safe!
      </div>
      <Button onClick={onClose} className="mt-4 w-full">
        Continue
      </Button>
    </>
  )
}

function DeniedContent({ onClose }: { onClose: () => void }) {
  return (
    <>
      <XCircleIcon className="text-scarlet-500 mx-auto h-16 w-16" />
      <div className="text-scarlet-600 text-center text-2xl font-semibold">
        Verification Unsuccessful
      </div>
      <div className="text-ink-600 text-center">
        We were unable to verify your identity. This could be due to image
        quality issues or document problems. You can try again later from your
        profile settings.
      </div>
      <Button onClick={onClose} color="gray" className="mt-4 w-full">
        Continue
      </Button>
    </>
  )
}

function UnverifiedContent({ onClose }: { onClose: () => void }) {
  return (
    <>
      <ClockIcon className="text-amber-500 mx-auto h-16 w-16" />
      <div className="text-ink-900 text-center text-2xl font-semibold">
        Verification Pending
      </div>
      <div className="text-ink-600 text-center">
        Your identity verification is being processed. This usually takes a few
        minutes. We'll update your status once the review is complete.
      </div>
      <Button onClick={onClose} color="indigo-outline" className="mt-4 w-full">
        Continue
      </Button>
    </>
  )
}
