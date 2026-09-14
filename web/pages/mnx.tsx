import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { getMnxInstrument } from 'common/perps/mnx'
import { MNX_LINK_LOCATIONS, mnxLinkUrl } from 'common/perps/mnx-cta'
import { Button } from 'web/components/buttons/button'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

// The existing MNX anchors open this page in a new tab, keeping native link
// behavior while we wait for Firebase auth and the server-generated signature.
export default function MnxRedirectPage() {
  const router = useRouter()
  const authorized = useIsAuthorized()
  const user = useUser()
  const [error, setError] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const { feedId, location } = router.query

  useEffect(() => {
    if (!router.isReady || authorized === undefined) return
    setError(undefined)
    const instrument = getMnxInstrument(
      typeof feedId === 'string' ? feedId : undefined
    )
    const placement = MNX_LINK_LOCATIONS.find((value) => value === location)
    if (!instrument || !placement) {
      setError(
        'This MNX link is invalid. Please return to the market and try again.'
      )
      return
    }

    let cancelled = false
    const redirect = async () => {
      try {
        const url = authorized
          ? (
              await api('get-mnx-invite-link', {
                feedId: instrument.feedId,
                location: placement,
              })
            ).url
          : mnxLinkUrl(instrument.url, placement)
        if (!cancelled) window.location.replace(url)
      } catch {
        if (!cancelled)
          setError('We couldn’t create your MNX invite. Please try again.')
      }
    }
    void redirect()
    return () => {
      cancelled = true
    }
  }, [router.isReady, authorized, user?.id, feedId, location, attempt])

  return (
    <Page trackPageView={false}>
      <SEO title="Continue to MNX" description="Continue to MNX" shouldIgnore />
      <div className="flex flex-col items-center gap-4 px-4 py-16">
        <p role={error ? 'alert' : 'status'}>{error ?? 'Opening MNX…'}</p>
        {error && (
          <Button onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
        )}
      </div>
    </Page>
  )
}
