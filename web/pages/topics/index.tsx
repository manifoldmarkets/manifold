import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { QueryUncontrolledTabs, Tab } from 'web/components/layout/tabs'
import { Col } from 'web/components/layout/col'
import { MdTimer } from 'react-icons/md'
import { GiAmericanFootballHelmet } from 'react-icons/gi'
import { BiBasketball } from 'react-icons/bi'
import { MdSportsSoccer } from 'react-icons/md'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useUser } from 'web/hooks/use-user'
import { buildArray } from 'common/util/array'
import { LiveGeneratedFeed } from 'web/components/feed/live-generated-feed'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { uniqBy, orderBy } from 'lodash'
import { APIParams } from 'common/api/schema'
import { FaFire } from 'react-icons/fa6'

function useCombinedMarkets(
  props: APIParams<'search-markets-full'> & {
    sweepScoreBoost?: number
  }
) {
  const { sweepScoreBoost, ...rest } = props
  const { data: manaMarkets } = useAPIGetter('search-markets-full', {
    ...rest,
    token: 'MANA',
  })

  const { data: sweepMarkets } = useAPIGetter('search-markets-full', {
    ...rest,
    token: 'CASH',
  })
  const sweepMarketsAdjusted = (sweepMarkets ?? []).map((m) => ({
    ...m,
    importanceScore: m.importanceScore + (sweepScoreBoost ?? 0.25),
  }))

  const combinedMarkets = orderBy(
    uniqBy([...sweepMarketsAdjusted, ...(manaMarkets ?? [])], 'id'),
    (m) => m.importanceScore,
    'desc'
  )

  return combinedMarkets
}
const NFL_ID = 'TNQwmbE5p6dnKx2e6Qlp'
const NBA_ID = 'i0v3cXwuxmO9fpcInVYb'
const EPL_ID = '5gsW3dPR3ySBRZCodrgm'
const SPORTS_ID = '2hGlgVhIyvVaFyQAREPi'
const colClass = 'gap-4 p-1'
const ALL_IDS = [NFL_ID, SPORTS_ID, EPL_ID, NBA_ID].join(',')
function LiveSoonContent() {
  const contracts = useCombinedMarkets({
    term: '',
    filter: 'closing-day',
    sort: 'close-date',
    gids: ALL_IDS,
    limit: 7,
  })

  return (
    <Col className={colClass}>
      {contracts.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

function ForecastsContent() {
  const contracts = useCombinedMarkets({
    term: '',
    filter: 'open',
    sort: 'score',
    gids: ALL_IDS,
    limit: 7,
    sweepScoreBoost: 0.2,
  })

  return (
    <Col className={colClass}>
      {contracts.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

function NFLContent() {
  const contracts = useCombinedMarkets({
    term: '',
    filter: 'open',
    gids: NFL_ID,
    limit: 7,
  })

  return (
    <Col className={colClass}>
      {contracts.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

function NBAContent() {
  const contracts = useCombinedMarkets({
    term: '',
    filter: 'open',
    gids: NBA_ID,
    limit: 7,
  })

  return (
    <Col className={colClass}>
      {contracts.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

function EPLContent() {
  const contracts = useCombinedMarkets({
    term: '',
    filter: 'open',
    sort: 'close-date',
    gids: EPL_ID,
    limit: 7,
  })

  return (
    <Col className={colClass}>
      {contracts.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
    </Col>
  )
}

function SportsTabs() {
  const SPORTS_TABS: Tab[] = [
    {
      title: 'Live/soon',
      content: <LiveSoonContent />,
      stackedTabIcon: <MdTimer className="mb-1 h-6 w-6" />,
    },
    {
      title: 'Trending',
      content: <ForecastsContent />,
      stackedTabIcon: <FaFire className="mb-1 h-6 w-6" />,
    },
    {
      title: 'NFL',
      content: <NFLContent />,
      stackedTabIcon: <GiAmericanFootballHelmet className="mb-1 h-6 w-6" />,
    },
    {
      title: 'NBA',
      content: <NBAContent />,
      stackedTabIcon: <BiBasketball className="mb-1 h-6 w-6" />,
    },
    {
      title: 'EPL',
      content: <EPLContent />,
      stackedTabIcon: <MdSportsSoccer className="mb-1 h-6 w-6" />,
    },
  ]
  return (
    <Col className="w-full">
      <QueryUncontrolledTabs
        tabs={SPORTS_TABS}
        defaultIndex={0}
        labelsParentClassName="mr-4"
        trackingName="sports-tabs"
      />
    </Col>
  )
}

export default function TopicsPage() {
  const user = useUser()
  useSaveScroll('topics', true)
  const PARENT_TABS: Tab[] = buildArray(
    { title: 'Sports', content: <SportsTabs /> },
    user && {
      title: 'Explore',
      content: <LiveGeneratedFeed userId={user.id} />,
    }
  )

  return (
    <Page trackPageView="/topics">
      <SEO
        title="Topics"
        description="Browse topics and categories"
        url="/topics"
      />
      <Col className="relative w-full p-1">
        {/* <SweepsToggle
          className="!absolute right-2 top-2"
          sweepsEnabled={true}
        /> */}
        <QueryUncontrolledTabs
          tabs={PARENT_TABS}
          defaultIndex={0}
          trackingName="topics-tabs"
        />
      </Col>
    </Page>
  )
}
