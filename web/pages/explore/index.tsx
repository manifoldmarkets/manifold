import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { UnifiedFeed } from 'web/components/feed/unified-feed'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useUser } from 'web/hooks/use-user'

export function ExploreContent(props: { render: boolean }) {
  const { render } = props
  const user = useUser()
  useSaveReferral(user)
  useSaveScroll('explore', true)

  if (!render) return null
  if (user === undefined) {
    return <LoadingIndicator />
  }

  return (
    <Col className="w-full px-2">
      <UnifiedFeed />
    </Col>
  )
}

export default function ExplorePage() {
  return (
    <Page trackPageView="/explore" className="!col-span-7">
      <SEO title="Explore" description="Explore" url="/explore" />
      <ExploreContent render={true} />
    </Page>
  )
}
