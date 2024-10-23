import clsx from 'clsx'
import { Contract } from 'common/contract'
import { ENV } from 'common/envs/constants'
import { formatMoneyUSD } from 'common/util/format'
import Image from 'next/image'
import Link from 'next/link'
import { buttonClass } from 'web/components/buttons/button'
import { USElectionsPage } from 'web/components/elections-page'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SEO } from 'web/components/SEO'
import { CoinNumber } from 'web/components/widgets/coin-number'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useTracking } from 'web/hooks/use-tracking'
import SquiggleVertical from 'web/lib/icons/squiggle-vertical.svg'
import { getElectionsPageProps } from 'web/lib/politics/home'
import { ElectionsPageProps } from 'web/public/data/elections-data'
import { initSupabaseAdmin } from '../lib/supabase/admin-db'
import Custom404 from './404'
import { getContractFromSlug } from 'common/supabase/contracts'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { PromotionalPanel } from './pakman'

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
        welcomerName="Patrick McKenzie"
      />

      <FeedContractCard
        contract={props.complexSystemsContract}
        className="mx-1 mb-6 w-[calc(100%-0.5rem)] sm:mx-2 sm:w-[calc(100%-1rem)]"
      />
      <USElectionsPage {...props} hideTitle />
    </Page>
  )
}
