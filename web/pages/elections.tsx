import {
  ELECTION_DASHBOARD_DESCRIPTION,
  ELECTION_DASHBOARD_TITLE,
  ElectionsPageProps,
} from 'common/politics/elections-data'
import { getDashboardProps } from 'web/lib/politics/dashboard'
import { USElectionsPage } from 'web/components/elections-page'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'

export async function getStaticProps() {
  const props = await getDashboardProps(false)
  return {
    props,
    revalidate: 60,
  }
}
export default function Elections(props: ElectionsPageProps) {
  return (
    <Page trackPageView="us elections page 2024">
      <SEO
        title={ELECTION_DASHBOARD_TITLE}
        description={ELECTION_DASHBOARD_DESCRIPTION}
        // TODO: add a nice preview image
      />
      <USElectionsPage {...props} />
    </Page>
  )
}
