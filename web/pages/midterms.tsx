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

export const senateMidterms: StateElectionMarket[] = [
  {
    state: 'WA',
    creatorUsername: 'BTE',
    slug: 'will-patty-murray-be-reelected-to-t',
    isWinRepublican: false,
  },
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
  {
    state: 'MO',
    creatorUsername: 'Tetraspace',
    slug: 'if-trudy-valentine-is-the-2022-miss',
    isWinRepublican: false,
  },
  {
    state: 'SD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9e20bcf16a85',
    isWinRepublican: false,
  },
  {
    state: 'OK',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9e20bcf16a85',
    isWinRepublican: false,
  },
  {
    state: 'SD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9e20bcf16a85',
    isWinRepublican: false,
  },
  {
    state: 'SD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9e20bcf16a85',
    isWinRepublican: false,
  },
  {
    state: 'SD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9e20bcf16a85',
    isWinRepublican: false,
  },
  {
    state: 'SD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9e20bcf16a85',
    isWinRepublican: false,
  },
  {
    state: 'SD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9e20bcf16a85',
    isWinRepublican: false,
  },
  {
    state: 'OK',
    creatorUsername: 'MarketManagerBot',
    slug: 'democrats-will-get-this-proportion',
    isWinRepublican: false,
  },
  {
    state: 'VT',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-78137b484e82',
    isWinRepublican: false,
  },
  {
    state: 'SC',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-6c17e79dcbc7',
    isWinRepublican: false,
  },
  {
    state: 'OR',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-2e17162e35e3',
    isWinRepublican: false,
  },
  {
    state: 'ND',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-d63e8403eaf8',
    isWinRepublican: false,
  },
  {
    state: 'NY',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9acf1c9dbde2',
    isWinRepublican: false,
  },
  {
    state: 'MD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-f38de1a9d8b3',
    isWinRepublican: false,
  },
  {
    state: 'LA',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-88f93c4e8430',
    isWinRepublican: false,
  },
  {
    state: 'KY',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-0d3bc064b867',
    isWinRepublican: false,
  },
  {
    state: 'KS',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-1840f00088a8',
    isWinRepublican: false,
  },
  {
    state: 'IA',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-462155819f0f',
    isWinRepublican: false,
  },
  {
    state: 'IN',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-7795f0aa3944',
    isWinRepublican: false,
  },
  {
    state: 'IL',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-801058d5db69',
    isWinRepublican: false,
  },
  {
    state: 'ID',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-16ea8a207639',
    isWinRepublican: false,
  },
  {
    state: 'HI',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-9d6b42ddb5c4',
    isWinRepublican: false,
  },
  {
    state: 'CT',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-1022c364c3f0',
    isWinRepublican: false,
  },
  {
    state: 'CA',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-60a8e5403368',
    isWinRepublican: false,
  },
  {
    state: 'AR',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s-8b6fbce553d5',
    isWinRepublican: false,
  },
  {
    state: 'AK',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-wins-the-2022-race-for-s',
    isWinRepublican: false,
  },
  {
    state: 'AL',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-se',
    isWinRepublican: false,
  },
]

export const governorMidterms: StateElectionMarket[] = [
  {
    state: 'OK',
    creatorUsername: 'NicholasCharette73b6',
    slug: 'will-kevin-stitt-win-the-2022-oklah',
    isWinRepublican: true,
  },
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
    state: 'ME',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-maine',
    isWinRepublican: false,
  },
  {
    state: 'NM',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-new-me',
    isWinRepublican: false,
  },
  {
    state: 'MN',
    creatorUsername: 'BRTD',
    slug: 'will-tim-walz-be-reelected-as-gover',
    isWinRepublican: false,
  },
  {
    state: 'MI',
    creatorUsername: 'SG',
    slug: 'will-a-democrat-win-the-2022-michig',
    isWinRepublican: false,
  },
  {
    state: 'NY',
    creatorUsername: 'GeorgeSchifini',
    slug: 'will-hochul-win-new-york-governor-r',
    isWinRepublican: false,
  },
  {
    state: 'RI',
    creatorUsername: 'Tetraspace',
    slug: 'if-dan-mckee-is-the-democratic-nomi',
    isWinRepublican: false,
  },
  {
    state: 'AL',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go',
    isWinRepublican: false,
  },
  {
    state: 'AR',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-385b9a14af8f',
    isWinRepublican: false,
  },
  {
    state: 'CA',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-552c14cd24d6',
    isWinRepublican: false,
  },
  {
    state: 'HI',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-d85c9600c910',
    isWinRepublican: false,
  },
  {
    state: 'CT',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-de6277d93167',
    isWinRepublican: false,
  },
  {
    state: 'ID',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-7d6e427ef03e',
    isWinRepublican: false,
  },
  {
    state: 'IL',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-52b16da5fdb3',
    isWinRepublican: false,
  },
  {
    state: 'IA',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-9fa0f51f0358',
    isWinRepublican: false,
  },
  {
    state: 'NH',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-e297970d87ff',
    isWinRepublican: false,
  },
  {
    state: 'MA',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-ac78dc96220f',
    isWinRepublican: false,
  },
  {
    state: 'OH',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-5d3ae0582a1b',
    isWinRepublican: false,
  },
  {
    state: 'SC',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-e15ec0b3f8ee',
    isWinRepublican: false,
  },
  {
    state: 'NE',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-bf78dcda9c99',
    isWinRepublican: false,
  },
  {
    state: 'SD',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-cf7193bf9ab0',
    isWinRepublican: false,
  },
  {
    state: 'TN',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-11c18eea32a7',
    isWinRepublican: false,
  },
  {
    state: 'VT',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-f11fde5396e7',
    isWinRepublican: false,
  },
  {
    state: 'WY',
    creatorUsername: 'MarketManagerBot',
    slug: 'a-democrat-win-the-2022-race-for-go-c0c7e02a0188',
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
        src="https://manifold.markets/embed/BoltonBailey/will-democrats-maintain-control-of-8d067eb38c33"
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
        src="https://manifold.markets/embed/SG/will-democrats-lose-at-least-one-go"
        frameBorder="0"
        className="mt-8 flex h-96 w-full sm:px-12"
      ></iframe>
    </div>
  )

  const houseTab = (
    <div className="w-full">
      <iframe
        src="https://manifold.markets/embed/BoltonBailey/will-democrats-maintain-control-of"
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
          description="Manifold's midterm forecast using prediction markets. Bet on elections and win up to $1,000 in our tournament."
          image="https://manifold.markets/midterms2022.png"
        />

        <Title className="mt-2">
          {flourish} 2022 US Midterm Elections {flourish}
        </Title>

        <div className="text-ink-500 mx-8 mb-4 text-base">
          Manifold's midterm forecast. Bet on elections and{' '}
          <SiteLink href="/group/us-2022-midterms/about">
            win up to $1,000 USD in our tournament
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
        <Row className="text-ink-500 mt-8 mb-8 text-base">
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
