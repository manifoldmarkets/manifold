import { Page } from 'web/components/layout/page'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/firebase/api'
import { Headline } from 'common/news'
import { HeadlineTabs } from 'web/components/dashboard/header'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { Col } from 'web/components/layout/col'
import { LiveGeneratedFeed } from 'web/components/feed/live-generated-feed'

export async function getStaticProps() {
  try {
    const headlines = await api('headlines', {})
    return {
      props: {
        headlines,
        revalidate: 30 * 60, // 30 minutes
      },
    }
  } catch (err) {
    return { props: { headlines: [] }, revalidate: 60 }
  }
}

export default function Explore(props: { headlines: Headline[] }) {
  useRedirectIfSignedOut()
  const user = useUser()
  useSaveScroll('explore')

  const { headlines } = props
  return (
    <Page
      trackPageView={'home'}
      trackPageProps={{ kind: 'desktop' }}
      className=" !mt-0"
      banner={null}
    >
      <HeadlineTabs
        endpoint={'news'}
        headlines={headlines}
        currentSlug={'home'}
        hideEmoji
      />
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
