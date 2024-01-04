import { PoliticsPage } from 'politics/components/politics-page'
import { PoliticsTabs } from 'politics/components/politics-tabs'

export type ElectionMode = 'presidency' | 'congress'

export default async function Page() {
  return (
    <PoliticsPage trackPageView={'home'}>
      <PoliticsTabs />
    </PoliticsPage>
  )
}
