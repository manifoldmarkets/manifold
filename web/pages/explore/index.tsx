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
import {
  FeedContractCard,
  LoadingCards,
} from 'web/components/contract/feed-contract-card'
import { uniqBy, sortBy } from 'lodash'
import { APIParams } from 'common/api/schema'
import { FaFire, FaGripLinesVertical, FaHockeyPuck } from 'react-icons/fa6'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { SiteActivity } from 'web/components/site-activity'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { api } from 'web/lib/api/api'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { User } from 'common/user'
import { FaBaseballBall } from 'react-icons/fa'
import { Contract, isSportsContract } from 'common/contract'
import { tsToMillis } from 'common/supabase/utils'
import { ENV } from 'common/envs/constants'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import Link from 'next/link'
import { ArrowRightIcon } from '@heroicons/react/solid'
import { WEEK_MS } from 'common/util/time'

const isProd = ENV === 'PROD'
const NFL_ID = 'TNQwmbE5p6dnKx2e6Qlp'
const NBA_ID = 'i0v3cXwuxmO9fpcInVYb'
const EPL_ID = '5gsW3dPR3ySBRZCodrgm'
const SPORTS_ID = isProd ? '2hGlgVhIyvVaFyQAREPi' : 'IOffGO7C9c0dfDura9Yn'
const MLB_ID = 'RFwfANk54JSXOwj4qwsW,786nRQzgVyUnuUtaLTGW' // MLB, Baseball
const NHL_ID = 'lccgApXa1l7O5ZH3XfhH,tYP9jmPPjoX29KfzE4l5' // NHL, Hockey
const colClass = 'gap-4 p-1'
const ALL_IDS = [NFL_ID, SPORTS_ID, EPL_ID, NBA_ID, MLB_ID].join(',')

export function ExploreContent(props: { render: boolean }) {
  const { render } = props
  const user = useUser()
  const [isSportsInterested, setIsSportsInterested] = usePersistentLocalState<
    boolean | undefined
  >(undefined, 'is-sports-interested')
  const getIsSportsInterested = async () => {
    const { isSportsInterested } = await api('is-sports-interested', {})
    setIsSportsInterested(isSportsInterested)
  }
  const isNewUser = user && user.createdTime > Date.now() - WEEK_MS

  useEffect(() => {
    if (user && isSportsInterested === undefined) {
      getIsSportsInterested()
    }
  }, [user?.id])
  const sportsFirst = isSportsInterested

  if (!render) return null
  if (user === undefined || (user && isSportsInterested === undefined)) {
    return <LoadingIndicator />
  }
  const baseTabs: Tab[] = buildArray(
    sportsFirst && {
      title: 'Sports',
      content: <SportsTabs />,
    },
    user && {
      title: 'Feed',
      content: (
        <Col className="pt-1">
          <LiveGeneratedFeed userId={user.id} />
        </Col>
      ),
    },
    {
      title: 'Site activity',
      content: (
        <Col className="pt-1">
          <SiteActivity />
        </Col>
      ),
    },
    !sportsFirst && { title: 'Sports', content: <SportsTabs /> }
  )

  return <OrganizableMarketsPage user={user} tabs={baseTabs} />
}

const OrganizableMarketsPage = (props: { user: User | null; tabs: Tab[] }) => {
  const { user, tabs: baseTabs } = props
  useSaveScroll('topics', true)

  const [tabOrder, setTabOrder] = usePersistentLocalState<string[]>(
    baseTabs.map((tab) => tab.title),
    `topics-tab-order-${user?.id}`
  )

  const tabs = [
    ...tabOrder
      .map((title) => baseTabs.find((tab) => tab.title === title))
      .filter((tab): tab is Tab => !!tab),
    ...baseTabs.filter((tab) => !tabOrder.includes(tab.title)),
  ]

  return (
    <Col className="relative w-full p-1">
      <DragDropContext
        onDragEnd={(result) => {
          if (!result.destination) return

          const newOrder = Array.from(tabs.map((tab) => tab.title))
          const [removed] = newOrder.splice(result.source.index, 1)
          newOrder.splice(result.destination.index, 0, removed)
          setTabOrder(newOrder)
        }}
      >
        <Droppable droppableId="topics-tabs" direction="horizontal">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              <QueryUncontrolledTabs
                className="bg-canvas-0 sticky top-0 z-10"
                tabInUrlKey="top-tab"
                tabs={tabs.map((tab, index) => ({
                  ...tab,
                  title: tab.title,
                  titleElement: (
                    <Draggable
                      key={tab.title}
                      draggableId={tab.title}
                      index={index}
                    >
                      {(provided) => (
                        <Row
                          className="items-center gap-2"
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          {tab.title}
                          {user && (
                            <FaGripLinesVertical className="text-ink-300" />
                          )}
                        </Row>
                      )}
                    </Draggable>
                  ),
                }))}
                defaultIndex={0}
                trackingName="topics-tabs"
                scrollToTop={true}
              />
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </Col>
  )
}

function LiveSoonContent() {
  return (
    <MarketsList
      sweepScoreBoost={0}
      fetchProps={{
        term: '',
        filter: 'closing-week',
        sort: 'start-time',
        gids: isProd ? ALL_IDS : SPORTS_ID,
      }}
      sortCallback={(c: Contract) =>
        isSportsContract(c)
          ? tsToMillis(c.sportsStartTimestamp)
          : c.closeTime ?? Infinity
      }
    />
  )
}

function ForecastsContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: ALL_IDS,
      }}
      sweepScoreBoost={0.2}
    />
  )
}

function NFLContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: NFL_ID,
      }}
    />
  )
}

function NBAContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: NBA_ID,
      }}
    />
  )
}

function EPLContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: EPL_ID,
      }}
    />
  )
}

function MLBContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: MLB_ID,
      }}
    />
  )
}

function NHLContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: NHL_ID,
      }}
    />
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
    {
      title: 'NHL',
      content: <NHLContent />,
      stackedTabIcon: <FaHockeyPuck className="mb-1 h-6 w-6" />,
    },
    {
      title: 'MLB',
      content: <MLBContent />,
      stackedTabIcon: <FaBaseballBall className="mb-1 h-6 w-6" />,
    },
  ]
  return (
    <Col className="w-full">
      <QueryUncontrolledTabs
        className="bg-canvas-0 sticky top-[2.9rem] z-10"
        tabs={SPORTS_TABS}
        defaultIndex={0}
        labelsParentClassName="mr-4"
        trackingName="sports-tabs"
        scrollToTop={true}
      />
    </Col>
  )
}

function MarketsList(
  props: {
    fetchProps: APIParams<'search-markets-full'>
  } & {
    sweepScoreBoost?: number
    sortCallback?: (c: Contract) => number
  }
) {
  const { sweepScoreBoost, fetchProps, sortCallback } = props
  const limit = 10
  const [loading, setLoading] = useState(false)
  const [data, setData] = usePersistentInMemoryState<{
    markets: any[]
    manaOffset: number
    cashOffset: number
  }>(
    { markets: [], manaOffset: 0, cashOffset: 0 },
    `markets-list-${JSON.stringify(fetchProps)}`
  )

  const loadMore = async () => {
    if (loading) return false
    setLoading(true)
    try {
      const [manaMarkets, cashMarkets] = await Promise.all([
        api('search-markets-full', {
          ...fetchProps,
          token: 'MANA',
          limit,
          offset: data.manaOffset,
        }),
        api('search-markets-full', {
          ...fetchProps,
          token: 'CASH',
          limit,
          offset: data.cashOffset,
        }),
      ])

      const cashMarketsAdjusted = cashMarkets.map((m) => ({
        ...m,
        importanceScore: m.importanceScore + (sweepScoreBoost ?? 0.25),
      }))

      const newMarkets = sortBy(
        uniqBy([...cashMarketsAdjusted, ...manaMarkets], 'id'),
        (m) => sortCallback?.(m) ?? m.importanceScore
      )

      setData({
        markets: uniqBy([...data.markets, ...newMarkets], 'id'),
        manaOffset: data.manaOffset + manaMarkets.length,
        cashOffset: data.cashOffset + cashMarkets.length,
      })
      return newMarkets.length > 0
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (data.markets.length === 0) {
      loadMore()
    }
  }, [])

  return (
    <Col className={colClass}>
      {data.markets.map((contract) => (
        <FeedContractCard key={contract.id} contract={contract} />
      ))}
      <div className="relative">
        {loading && <LoadingCards rows={3} />}
        <LoadMoreUntilNotVisible loadMore={loadMore} />
      </div>
    </Col>
  )
}
const topicsToIds: {
  [key: string]: {
    groupIds: string[]
    slug: string
  }
} = {
  '🗳️ Politics': {
    groupIds: ['AjxQR8JMpNyDqtiqoA96', 'UCnpxVUdLOZYgoMsDlHD'],
    slug: 'politics-default',
  },

  '💻 Technology': {
    groupIds: [
      'IlzY3moWwOcpsVZXCVej', // Technology
      'SmJk6RHToaLxLk0I1ZSC', // Space
    ],
    slug: 'technology-default',
  },
  '🤖 AI': {
    groupIds: ['yEWvvwFFIqzf8JklMewp', 'GbbX9U5pYnDeftX9lxUh'],
    slug: 'ai',
  },
  '🎬 Entertainment': {
    groupIds: [
      'eJZecx6r22G2NriYYXcC', // Culture
      'XU1fOYURSnb58lgsqaly', // Entertainment & Pop culture
      '4QIcUOfCSSha0JZHAg9X', // celebrities
    ],
    slug: 'entertainment',
  },
  '🍿 Movies & TV': {
    groupIds: [
      'KSeNIu7AWgiBBM5FqVuB', // Movies
      'EUSEngFk1dGGBfaMeAmh', // TV and Film
    ],
    slug: 'television-film',
  },
  '💵 Business': {
    groupIds: [
      'pmK8sntWL1SDkMm53UBR', // Business
      'CgB83AAMkkOHSrTnzani', // Finance
      'QDQfgsFiQrNNlZhsRGf5', // Stocks
      'pK06hNX8MsNw8zaBsX2N', // Tech Stocks
      '1a9ef4d5-dcc6-468f-a9b7-feccdaa92733', // Big Tech
      'p88Ycq6yFd5ECKqq9PFO', // Economics
      'YuJw0M1xvUHrpiRRuKso',
      'WBeBD6FyMd0NvSL0qjMb',
    ],
    slug: 'business',
  },
  '🏟️ Sports': {
    groupIds: [
      '2hGlgVhIyvVaFyQAREPi', // sports
      'NjkFkdkvRvBHoeMDQ5NB', // Basketball
      'beeb69e0-b36f-451a-80e1-e059df456bb1', // College Basketball
      'i0v3cXwuxmO9fpcInVYb', // NBA
      'TNQwmbE5p6dnKx2e6Qlp', // nfl
      'ky1VPTuxrLXMnHyajZFp', // college football
    ],
    slug: 'sports-default',
  },
}

function TopicsContent() {
  return (
    <Col className="gap-8 p-4">
      {Object.entries(topicsToIds).map(([topic, subtopics]) => (
        <TopicSection key={topic} topic={topic} subtopics={subtopics} />
      ))}
    </Col>
  )
}

function TopicSection(props: {
  topic: string
  subtopics: { slug: string; groupIds: string[] }
}) {
  const { topic, subtopics } = props
  const { slug, groupIds } = subtopics
  const { data: markets, loading } = useAPIGetter(
    'search-markets-full',
    {
      gids: groupIds.join(','),
      limit: 3,
      sort: 'score',
      filter: 'open',
    },
    undefined,
    slug + groupIds.join(',')
  )

  return (
    <Col className="gap-4">
      <Link href={`/topic/${slug}`} className="hover:text-primary-700">
        <h2 className="text-2xl font-bold">{topic}</h2>
      </Link>
      {loading || !markets ? (
        <LoadingCards rows={3} />
      ) : (
        markets.map((market) => (
          <FeedContractCard key={market.id} contract={market} />
        ))
      )}
      <Link href={`/topic/${slug}`} className="hover:text-primary-700">
        <Row className="items-center justify-end gap-2 text-lg">
          View 100's more markets in {topic}{' '}
          <ArrowRightIcon className="h-4 w-4" />
        </Row>
      </Link>
    </Col>
  )
}

export default function ExplorePage() {
  return (
    <Page trackPageView="/explore" className="!col-span-7">
      <SEO title="Explore" description="Explore" url="/explore" />
      <ExploreContent render={true} />
    </Page>
  )
}
