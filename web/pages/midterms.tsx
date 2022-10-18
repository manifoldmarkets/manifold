import { CPMMBinaryContract } from 'common/contract'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { Title } from 'web/components/widgets/title'
import {
  StateElectionMarket,
  StateElectionMap,
} from 'web/components/usa-map/state-election-map'
import { useTracking } from 'web/hooks/use-tracking'
import { getContractFromSlug } from 'web/lib/firebase/contracts'
import { Tabs } from 'web/components/layout/tabs'
import { SiteLink } from 'web/components/widgets/site-link'
import { ArrowRightIcon } from '@heroicons/react/outline'
import { Row } from 'web/components/layout/row'

const senateMidterms: StateElectionMarket[] = [
  {
    state: 'AZ',
    creatorUsername: 'BTE',
    slug: 'will-blake-masters-win-the-arizona',
    isWinRepublican: true,
  },
  {
    state: 'OH',
    creatorUsername: 'BTE',
    slug: 'will-jd-vance-win-the-ohio-senate-s',
    isWinRepublican: true,
  },
  {
    state: 'WI',
    creatorUsername: 'BTE',
    slug: 'will-ron-johnson-be-reelected-in-th',
    isWinRepublican: true,
  },
  {
    state: 'FL',
    creatorUsername: 'BTE',
    slug: 'will-marco-rubio-be-reelected-to-th',
    isWinRepublican: true,
  },
  {
    state: 'PA',
    creatorUsername: 'MattP',
    slug: 'will-dr-oz-be-elected-to-the-us-sen',
    isWinRepublican: true,
  },
  {
    state: 'GA',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-3d2432ba6d79',
    isWinRepublican: false,
  },
  {
    state: 'NV',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen',
    isWinRepublican: false,
  },
  {
    state: 'NC',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-6f1a901e1fcf',
    isWinRepublican: false,
  },
  {
    state: 'NH',
    creatorUsername: 'NcyRocks',
    slug: 'will-a-democrat-win-the-2022-us-sen-23194a72f1b7',
    isWinRepublican: false,
  },
  {
    state: 'UT',
    creatorUsername: 'SG',
    slug: 'will-mike-lee-win-the-2022-utah-sen',
    isWinRepublican: true,
  },
  {
    state: 'CO',
    creatorUsername: 'SG',
    slug: 'will-michael-bennet-win-the-2022-co',
    isWinRepublican: false,
  },
]

const governorMidterms: StateElectionMarket[] = [
  {
    state: 'TX',
    creatorUsername: 'LarsDoucet',
    slug: 'republicans-will-win-the-2022-texas',
    isWinRepublican: true,
  },
  {
    state: 'GA',
    creatorUsername: 'MattP',
    slug: 'will-stacey-abrams-win-the-2022-geo',
    isWinRepublican: false,
  },
  {
    state: 'FL',
    creatorUsername: 'Tetraspace',
    slug: 'if-charlie-crist-is-the-democratic',
    isWinRepublican: false,
  },
  {
    state: 'PA',
    creatorUsername: 'JonathanMast',
    slug: 'will-josh-shapiro-win-the-2022-penn',
    isWinRepublican: false,
  },
  {
    state: 'PA',
    creatorUsername: 'JonathanMast',
    slug: 'will-josh-shapiro-win-the-2022-penn',
    isWinRepublican: false,
  },
  {
    state: 'CO',
    creatorUsername: 'ScottLawrence',
    slug: 'will-jared-polis-be-reelected-as-co',
    isWinRepublican: false,
  },
  {
    state: 'OR',
    creatorUsername: 'Tetraspace',
    slug: 'if-tina-kotek-is-the-2022-democrati',
    isWinRepublican: false,
  },
  {
    state: 'MD',
    creatorUsername: 'Tetraspace',
    slug: 'if-wes-moore-is-the-2022-democratic',
    isWinRepublican: false,
  },
  {
    state: 'AK',
    creatorUsername: 'SG',
    slug: 'will-a-republican-win-the-2022-alas',
    isWinRepublican: true,
  },
  {
    state: 'AZ',
    creatorUsername: 'SG',
    slug: 'will-a-republican-win-the-2022-ariz',
    isWinRepublican: true,
  },
  {
    state: 'AZ',
    creatorUsername: 'SG',
    slug: 'will-a-republican-win-the-2022-ariz',
    isWinRepublican: true,
  },
  {
    state: 'WI',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-wiscon',
    isWinRepublican: false,
  },
  {
    state: 'NV',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-nevada',
    isWinRepublican: false,
  },
  {
    state: 'KS',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-kansas',
    isWinRepublican: false,
  },
  {
    state: 'NV',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-new-me',
    isWinRepublican: false,
  },
  {
    state: 'ME',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-maine',
    isWinRepublican: false,
  },
]

export async function getStaticProps() {
  const senateContracts = await Promise.all(
    senateMidterms.map((m) =>
      getContractFromSlug(m.slug).then((c) => c ?? null)
    )
  )

  const governorContracts = await Promise.all(
    governorMidterms.map((m) =>
      getContractFromSlug(m.slug).then((c) => c ?? null)
    )
  )

  return {
    props: { senateContracts, governorContracts },
    revalidate: 60, // regenerate after a minute
  }
}

const App = (props: {
  senateContracts: CPMMBinaryContract[]
  governorContracts: CPMMBinaryContract[]
}) => {
  const { senateContracts, governorContracts } = props

  useTracking('view midterms 2022')

  const senateTab = (
    <>
      <StateElectionMap markets={senateMidterms} contracts={senateContracts} />
      <iframe
        src="https://manifold.markets/TomShlomi/will-the-gop-control-the-us-senate"
        frameBorder="0"
        className="mt-8 flex h-96 w-full sm:px-12"
      ></iframe>
    </>
  )

  const governorTab = (
    <div className="w-full">
      <StateElectionMap
        markets={governorMidterms}
        contracts={governorContracts}
      />
      <iframe
        src="https://manifold.markets/ManifoldMarkets/democrats-go-down-at-least-one-gove"
        frameBorder="0"
        className="mt-8 flex h-96 w-full sm:px-12"
      ></iframe>
    </div>
  )

  const houseTab = (
    <div className="w-full">
      <iframe
        src="https://manifold.markets/BoltonBailey/will-democrats-maintain-control-of"
        frameBorder="0"
        className="mt-8 flex h-96 w-full sm:px-12"
      ></iframe>
    </div>
  )

  const flourish = <span className="hidden sm:inline">🇺🇸🗳️</span>

  return (
    <Page className="">
      <Col className="items-center justify-center">
        <SEO
          title="2022 US Midterm Elections on Manifold"
          description="Manifold's midterm forecast using prediction markets. Bet on elections and win up to $500 in our tournament."
          image="/midterms2022.png"
        />

        <Title className="mt-2">
          {flourish} 2022 US Midterm Elections {flourish}
        </Title>

        <div className="mx-8 mb-4 text-base text-gray-500">
          Manifold's midterm forecast. Bet on elections and{' '}
          <SiteLink href="/group/us-2022-midterms/about">
            win up to $500 USD in our tournament
          </SiteLink>
          .
        </div>
        <Tabs
          tabs={[
            { title: 'Senate', content: senateTab, className: 'w-full' },
            { title: 'Governors', content: governorTab, className: 'w-full' },
            { title: 'House', content: houseTab, className: 'w-full' },
          ]}
        />
        <Row className="mt-8 mb-8 text-base text-gray-500">
          <SiteLink
            href="/group/us-2022-midterms/markets"
            className="flex items-center"
          >
            See all midterm election markets{' '}
            <ArrowRightIcon className="ml-1 h-5 w-5" />
          </SiteLink>
        </Row>
      </Col>
    </Page>
  )
}

export default App
