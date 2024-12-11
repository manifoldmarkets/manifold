import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { QueryUncontrolledTabs, Tab } from 'web/components/layout/tabs'
import { Col } from 'web/components/layout/col'
import { MdTimer } from 'react-icons/md'
import { IoStatsChart } from 'react-icons/io5'
import { GiAmericanFootballHelmet } from 'react-icons/gi'
import { BiBasketball } from 'react-icons/bi'
import { MdSportsSoccer } from 'react-icons/md'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useUser } from 'web/hooks/use-user'
import { buildArray } from 'common/util/array'
import { LiveGeneratedFeed } from 'web/components/feed/live-generated-feed'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { DAY_MS } from 'common/util/time'
import { uniqBy } from 'lodash'

function useCombinedMarkets(props: any) {
  const { data: manaMarkets } = useAPIGetter('search-markets-full', {
    ...props,
    token: 'MANA',
  })

  const { data: sweepstakesMarkets } = useAPIGetter('search-markets-full', {
    ...props,
    token: 'CASH',
  })

  const combinedMarkets = uniqBy(
    [...(sweepstakesMarkets ?? []), ...(manaMarkets ?? [])],
    'id'
  )

  return combinedMarkets
}

function LiveSoonContent() {
  const contracts = useCombinedMarkets({
    term: '',
    filter: 'open',
    sort: 'close-date',
    limit: 50,
    before: Date.now() + DAY_MS,
  })

  return (
    <Col className="gap-4">
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
    groupId: '2hGlgVhIyvVaFyQAREPi',
    limit: 50,
  })

  return (
    <Col className="gap-4">
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
    groupId: 'TNQwmbE5p6dnKx2e6Qlp',
    limit: 50,
  })

  return (
    <Col className="gap-4">
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
    groupId: 'i0v3cXwuxmO9fpcInVYb',
    limit: 50,
  })

  return (
    <Col className="gap-4">
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
    limit: 50,
  })

  return (
    <Col className="gap-4">
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
      title: 'Forecasts',
      content: <ForecastsContent />,
      stackedTabIcon: <IoStatsChart className="mb-1 h-6 w-6" />,
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
      <Col className="w-full">
        <QueryUncontrolledTabs
          tabs={PARENT_TABS}
          defaultIndex={0}
          trackingName="topics-tabs"
        />
      </Col>
    </Page>
  )
}
