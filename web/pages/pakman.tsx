import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import Custom404 from './404'
import { ENV } from 'common/envs/constants'
import { useTracking } from 'web/hooks/use-tracking'
import { PromotionalPanel } from 'web/components/promotional-panel'
import { SweepiesFlatCoin } from 'web/public/custom-components/sweepiesFlatCoin'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Contract } from 'common/contract'
import { api } from 'web/lib/api/api'
import { Col } from 'web/components/layout/col'

const revalidate = 60

export async function getStaticProps() {
  if (ENV === 'DEV') {
    return {
      props: {},
      revalidate,
    }
  }

  const [contract, politicsMarkets] = await Promise.all([
    api('get-contract', { contractId: 'OPl99N5Aun' }),
    api('search-markets-full', {
      term: '',
      filter: 'all',
      sort: 'score',
      limit: 10,
      topicSlug: 'us-politics',
    }),
  ])

  return {
    props: {
      contract,
      politicsMarkets,
    },
    revalidate,
  }
}

export default function Pakman(props: {
  contract: Contract
  politicsMarkets: Contract[]
}) {
  useTracking('pakman page view')

  if (!props.contract) {
    return <Custom404 />
  }

  return (
    <Page trackPageView="Pakman page" className="!col-span-7">
      <SEO
        title="Pakman Manifold"
        description="The David Pakman Show on Manifold."
        url="/pakman"
      />
      <PromotionalPanel
        darkModeImg={'/pakman/pakman_show_white.png'}
        lightModeImg={'/pakman/pakman_show.png'}
        header={
          <>
            Welcome, from <b>David Pakman</b>
          </>
        }
        description={
          <>
            Referral bonus has been applied. Register today to claim free 3{' '}
            <SweepiesFlatCoin /> and unlock this purchase offer!
          </>
        }
        loginTrackingText="Sign up from /pakman"
      />

      <Col className="mt-8 gap-4">
        <FeedContractCard contract={props.contract} key={props.contract.id} />
        {props.politicsMarkets.map((market) => (
          <FeedContractCard key={market.id} contract={market} />
        ))}
      </Col>
    </Page>
  )
}
