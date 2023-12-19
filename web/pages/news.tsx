import { Dashboard, DashboardLinkItem } from 'common/dashboard'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { NewsTopicsTabs } from 'web/components/news/news-topics-tabs'
import { Title } from 'web/components/widgets/title'
import { useSaveCampaign } from 'web/hooks/use-save-campaign'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { getNewsDashboards } from 'web/lib/firebase/api'
import { fetchLinkPreviews, LinkPreviews } from 'common/link-preview'
import { useUser } from 'web/hooks/use-user'

export async function getStaticProps() {
  const dashboards = (await getNewsDashboards()) as Dashboard[]
  const links = dashboards.flatMap((d) =>
    d.items.filter((item): item is DashboardLinkItem => item.type === 'link')
  )

  const previews = await fetchLinkPreviews(links.map((l) => l.url))

  return {
    props: {
      dashboards,
      previews,
      revalidate: 4 * 60 * 60, // 4 hours
    },
  }
}

export default function NewsPage(props: {
  dashboards: Dashboard[]
  previews: LinkPreviews
}) {
  const user = useUser()
  useSaveReferral(user)
  useSaveCampaign()

  return (
    <Page trackPageView={'news page'}>
      <SEO
        title="News"
        description="Breaking news meets the wisdom of the crowd"
      />
      <Col className="mx-auto w-full gap-6 pb-8 sm:px-2 lg:pr-4">
        <Row className="mx-4 mt-2 items-center justify-between gap-4">
          <Title className="!mb-0">News</Title>
        </Row>

        <NewsTopicsTabs {...props} />
      </Col>
    </Page>
  )
}
