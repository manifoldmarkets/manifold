import { useState, useEffect } from 'react'

import { canReceiveBonuses, User } from 'common/user'
import { api } from 'web/lib/api/api'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'

export function IdentityVerificationPage(props: {
  user: User | null | undefined
  onSkip: () => void
  onComplete: () => void
}) {
  const { user, onSkip, onComplete } = props
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<
    'pending' | 'approved' | 'denied' | 'suspected' | null
  >(null)

  // Check if user is already eligible for bonuses
  const isAlreadyEligible = user ? canReceiveBonuses(user) : false

  // Fetch verification status from the database
  useEffect(() => {
    if (!user || isAlreadyEligible) return
    
    api('get-idenfy-status', {})
      .then((result) => {
        setVerificationStatus(result.status)
      })
      .catch((e) => {
        console.error('Failed to fetch verification status:', e)
      })
  }, [user?.id, isAlreadyEligible])

  const isPending = verificationStatus === 'pending'

  const handleVerify = async () => {
    if (!user) return

    setLoading(true)
    setError(null)

    try {
      track('identity verification: started')
      
      // Mark onboarding as complete before redirecting to iDenfy
      // so users don't see the welcome modal again when they return
      await api('me/update', { shouldShowWelcome: false })
      
      const response = await api('create-idenfy-session', {})

      // Redirect to iDenfy verification page
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError('Failed to start verification. Please try again.')
      track('identity verification: error', {
        error: e instanceof Error ? e.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = () => {
    track('identity verification: skipped')
    onSkip()
  }

  if (isAlreadyEligible) {
    return (
      <Col className="gap-4">
        <div className="text-primary-700 mb-2 text-center text-2xl font-normal">
          You're All Set!
        </div>
        <div className="text-ink-600 text-center text-lg">
          You're already eligible for bonuses and cash prize raffles.
        </div>
        <Row className="mt-4 justify-center">
          <Button onClick={onComplete}>Continue</Button>
        </Row>
      </Col>
    )
  }

  if (isPending) {
    return (
      <Col className="gap-4">
        <div className="text-primary-700 mb-2 text-center text-2xl font-normal">
          Verification Pending
        </div>
        <div className="text-ink-600 text-center text-lg">
          Your identity verification is being processed. This usually takes a
          few minutes.
        </div>
        <Row className="mt-4 justify-between">
          <Button color="gray-white" onClick={handleSkip}>
            Continue for now
          </Button>
          <Button onClick={() => window.location.reload()}>
            Check status
          </Button>
        </Row>
      </Col>
    )
  }

  return (
    <Col className="gap-4">
      <div className="text-primary-700 mb-2 text-center text-2xl font-normal">
        Verify Your Identity
      </div>

      <div className="text-ink-700 text-lg">
        Verify your identity to receive bonuses and participate in our cash
        prize raffles. This quick process helps prevent fraud and ensures a
        secure experience for everyone.
      </div>

      <Col className="bg-canvas-50 mt-2 rounded-lg p-4">
        <div className="text-ink-800 font-semibold">What you'll need:</div>
        <ul className="text-ink-600 mt-2 list-inside list-disc space-y-1">
          <li>A valid government-issued ID (passport, driver's license, etc.)</li>
          <li>A device with a camera for a quick selfie</li>
          <li>About 2-3 minutes of your time</li>
        </ul>
      </Col>

      {error && (
        <div className="text-scarlet-500 mt-2 text-center text-sm">{error}</div>
      )}

      <Row className="mt-4 justify-between">
        <Button color="gray-white" onClick={handleSkip} disabled={loading}>
          Skip for now
        </Button>
        <Button onClick={handleVerify} loading={loading}>
          Verify Identity
        </Button>
      </Row>

      <div className="text-ink-500 mt-2 text-center text-sm">
        Your information is securely processed by our verification partner and
        is never shared with third parties.
      </div>
    </Col>
  )
}
