import { useState } from 'react'
import { api, APIError } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'

// Starts an iDenfy session and redirects to it. Identity verification is
// optional: it unlocks prize drawings and early commenting, and clears an
// admin flag.
export function useStartIdentityVerification(
  trackingEvent: string,
  trackingProps?: Parameters<typeof track>[1]
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setLoading(true)
    setError(null)
    try {
      track(trackingEvent, trackingProps)
      const response = await api('create-idenfy-session', {})
      // Stay loading while the browser navigates away: re-enabling the button
      // lets a second click start a second session, whose stale callback can
      // later overwrite this one's result.
      window.location.href = response.redirectUrl
    } catch (e) {
      console.error('Failed to start verification:', e)
      setError(
        e instanceof APIError && (e.code === 503 || e.code === 400)
          ? e.message
          : 'Failed to start verification. Please try again.'
      )
      setLoading(false)
    }
  }

  return { start, loading, error }
}
