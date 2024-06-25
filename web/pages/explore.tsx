import { Page } from 'web/components/layout/page'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { Col } from 'web/components/layout/col'
import { LiveGeneratedFeed } from 'web/components/feed/live-generated-feed'

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
