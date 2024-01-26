import { PoliticsPage } from 'politics/components/politics-page'
import { USElectionsPage } from 'web/components/elections-page'
import { getDashboardProps } from 'web/lib/politics/dashboard'

export default async function Page() {
  const props = await getDashboardProps()
  return (
    <PoliticsPage trackPageView={'home'}>
      <USElectionsPage {...props} />
    </PoliticsPage>
  )
}
