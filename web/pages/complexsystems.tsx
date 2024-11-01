import { Contract } from 'common/contract'
import { ENV } from 'common/envs/constants'
import { USElectionsPage } from 'web/components/elections-page'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { useTracking } from 'web/hooks/use-tracking'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import { initSupabaseAdmin } from '../lib/supabase/admin-db'
import Custom404 from './404'
import { getContractFromSlug } from 'common/supabase/contracts'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { PromotionalPanel } from 'web/components/promotional-panel'

const revalidate = 60

export async function getStaticProps() {
  if (ENV === 'DEV') {
    return {
      props: {},
      revalidate,
    }
  }
  const adminDb = await initSupabaseAdmin()
  const complexSystemsContract = await getContractFromSlug(
    adminDb,
    'who-will-be-on-the-complex-systems'
  )

  const electionsPageProps = await getElectionsPageProps()
  return {
    props: {
      ...electionsPageProps,
      complexSystemsContract: complexSystemsContract,
    },
    revalidate,
  }
}

export default function ComplexSystems(
  props: ElectionsPageProps & { complexSystemsContract: Contract }
) {
  useTracking('complex systems page view')

  if (Object.keys(props).length === 0) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="Complex Systems page">
      <SEO
        title="Complex Systems Manifold"
        description="Complex Systems on Manifold."
        url="/complexsystems"
      />
      <PromotionalPanel
        darkModeImg={'/complex-systems/complex-systems.jpg'}
        lightModeImg={'/complex-systems/complex-systems.jpg'}
        header={
          <>
            Welcome, from <b>Patrick McKenzie</b>
          </>
        }
        loginTrackingText="Sign up from /complexsystems"
      />

      <FeedContractCard
        contract={props.complexSystemsContract}
        className="mx-1 mb-6 w-[calc(100%-0.5rem)] sm:mx-2 sm:w-[calc(100%-1rem)]"
      />
      <USElectionsPage {...props} hideTitle />
    </Page>
  )
}
