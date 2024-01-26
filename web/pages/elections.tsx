import { ElectionsPageProps } from 'common/election-contract-data'
import { getDashboardProps } from 'web/lib/politics/dashboard'
import { USElectionsPage } from 'web/components/elections-page'
import { Page } from 'web/components/layout/page'

export async function getStaticProps() {
  const props = await getDashboardProps()
  return {
    props,
    revalidate: 60,
  }
}
export default function Elections(props: ElectionsPageProps) {
  return (
    <Page trackPageView="us elections page 2024">
      <USElectionsPage {...props} />
    </Page>
  )
}
