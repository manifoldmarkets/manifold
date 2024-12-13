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
import { uniqBy, orderBy } from 'lodash'
import { APIParams } from 'common/api/schema'
import { FaFire, FaGripLinesVertical } from 'react-icons/fa6'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { SiteActivity } from 'web/components/site-activity'
import { VisibilityObserver } from 'web/components/widgets/visibility-observer'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { api } from 'web/lib/api/api'

const NFL_ID = 'TNQwmbE5p6dnKx2e6Qlp'
const NBA_ID = 'i0v3cXwuxmO9fpcInVYb'
const EPL_ID = '5gsW3dPR3ySBRZCodrgm'
const SPORTS_ID = '2hGlgVhIyvVaFyQAREPi'
const colClass = 'gap-4 p-1'
const ALL_IDS = [NFL_ID, SPORTS_ID, EPL_ID, NBA_ID].join(',')

function LiveSoonContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'closing-day',
        sort: 'close-date',
        gids: ALL_IDS,
      }}
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
        sort: 'close-date',
        gids: EPL_ID,
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
  ]
  return (
    <Col className="w-full">
      <QueryUncontrolledTabs
        className="bg-canvas-50 sticky top-[2.9rem] z-10"
        tabs={SPORTS_TABS}
        defaultIndex={0}
        labelsParentClassName="mr-4"
        trackingName="sports-tabs"
      />
    </Col>
  )
}

function MarketsList(
  props: {
    fetchProps: APIParams<'search-markets-full'>
  } & { sweepScoreBoost?: number }
) {
  const { sweepScoreBoost, fetchProps } = props
  const limit = 7
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
    if (loading) return
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

      const newMarkets = orderBy(
        uniqBy([...cashMarketsAdjusted, ...manaMarkets], 'id'),
        (m) => m.importanceScore,
        'desc'
      )

      setData({
        markets: uniqBy([...data.markets, ...newMarkets], 'id'),
        manaOffset: data.manaOffset + manaMarkets.length,
        cashOffset: data.cashOffset + cashMarkets.length,
      })
    } finally {
      setTimeout(() => setLoading(false), 50)
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
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => {
            if (visible && !loading) {
              loadMore()
            }
          }}
        />
      </div>
    </Col>
  )
}

export default function TopicsPage() {
  const user = useUser()
  useSaveScroll('topics', true)

  // Create the base tabs array
  const baseTabs: Tab[] = buildArray(
    { title: 'Sports', content: <SportsTabs /> },
    user && {
      title: 'Explore',
      content: (
        <Col className="pt-1">
          <LiveGeneratedFeed userId={user.id} />
        </Col>
      ),
    },
    {
      title: 'Activity',
      content: (
        <Col className="pt-1">
          <SiteActivity />
        </Col>
      ),
    }
  )

  // Store tab order in local storage
  const [tabOrder, setTabOrder] = usePersistentLocalState<string[]>(
    baseTabs.map((tab) => tab.title),
    'topics-tab-order-3'
  )
  useEffect(() => {
    if (!user?.id) return
    if (tabOrder.length !== baseTabs.length) {
      setTabOrder(baseTabs.map((tab) => tab.title))
    }
  }, [user?.id])

  // Reorder tabs based on saved order
  const PARENT_TABS = tabOrder
    .map((title) => baseTabs.find((tab) => tab.title === title))
    .filter((tab): tab is Tab => !!tab)

  return (
    <Page trackPageView="/markets">
      <SEO title="Markets" description="Explore markets" url="/markets" />
      <Col className="relative w-full p-1">
        <DragDropContext
          onDragEnd={(result) => {
            if (!result.destination) return

            const newOrder = Array.from(tabOrder)
            const [removed] = newOrder.splice(result.source.index, 1)
            newOrder.splice(result.destination.index, 0, removed)
            setTabOrder(newOrder)
          }}
        >
          <Droppable droppableId="topics-tabs" direction="horizontal">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                <QueryUncontrolledTabs
                  className="bg-canvas-50 sticky top-0 z-10"
                  tabs={PARENT_TABS.map((tab, index) => ({
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
                            <FaGripLinesVertical className="text-ink-300" />
                          </Row>
                        )}
                      </Draggable>
                    ),
                  }))}
                  defaultIndex={0}
                  trackingName="topics-tabs"
                />
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </Col>
    </Page>
  )
}
