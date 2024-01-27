import { PoliticsPage } from 'politics/components/politics-page'
import { USElectionsPage } from 'web/components/elections-page'
import { getDashboardProps } from 'web/lib/politics/dashboard'
import {
  ELECTION_DASHBOARD_DESCRIPTION,
  ELECTION_DASHBOARD_TITLE,
} from 'common/politics/elections-data'

export async function generateMetadata() {
  return {
    title: ELECTION_DASHBOARD_TITLE,
    description: ELECTION_DASHBOARD_DESCRIPTION,
    // TODO: add a nice preview image
  }
}

export default async function Page() {
  const props = await getDashboardProps(true)
  return (
    <PoliticsPage trackPageView={'home'}>
      <USElectionsPage {...props} />
    </PoliticsPage>
  )
}
