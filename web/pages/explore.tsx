import { Page } from 'web/components/layout/page'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { Col } from 'web/components/layout/col'
import { LiveGeneratedFeed } from 'web/components/feed/live-generated-feed'
import { DailyStats } from 'web/components/home/daily-stats'

export default function Explore() {
  useRedirectIfSignedOut()
  const user = useUser()
  useSaveScroll('explore')

  return (
    <Page
      trackPageView={'home'}
      trackPageProps={{ kind: 'desktop' }}
      className=" !mt-0"
      banner={null}
    >
      {user && (
        <DailyStats
          className="bg-canvas-50 z-50 mb-1 w-full px-2 py-2"
          user={user}
        />
      )}

      {!user ? (
        <LoadingIndicator />
      ) : (
        <Col className="mt-2 w-full items-center self-center pb-4 sm:px-4">
          {user && <LiveGeneratedFeed userId={user.id} reload={false} />}
        </Col>
      )}
    </Page>
  )
}
