import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { APIParams } from 'common/api/schema'
import { Contract, isSportsContract } from 'common/contract'
import { ENV } from 'common/envs/constants'
import { tsToMillis } from 'common/supabase/utils'
import { sortBy, uniqBy } from 'lodash'
import { useEffect, useState } from 'react'
import { BiBasketball } from 'react-icons/bi'
import { FaBaseballBall } from 'react-icons/fa'
import { FaFire, FaHockeyPuck } from 'react-icons/fa6'
import { GiAmericanFootballHelmet } from 'react-icons/gi'
import { MdSportsSoccer, MdTimer } from 'react-icons/md'
import {
  FeedContractCard,
  LoadingCards,
} from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { QueryUncontrolledTabs, Tab } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { LoadMoreUntilNotVisible } from 'web/components/widgets/visibility-observer'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { useSaveScroll } from 'web/hooks/use-save-scroll'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

const isProd = ENV === 'PROD'
const NFL_ID = 'TNQwmbE5p6dnKx2e6Qlp'
const NBA_ID = 'i0v3cXwuxmO9fpcInVYb'
const EPL_ID = '5gsW3dPR3ySBRZCodrgm'
const SPORTS_ID = isProd ? '2hGlgVhIyvVaFyQAREPi' : 'IOffGO7C9c0dfDura9Yn'
const MLB_ID = 'RFwfANk54JSXOwj4qwsW,786nRQzgVyUnuUtaLTGW' // MLB, Baseball
const NHL_ID = 'lccgApXa1l7O5ZH3XfhH,tYP9jmPPjoX29KfzE4l5' // NHL, Hockey
const ALL_IDS = [NFL_ID, SPORTS_ID, EPL_ID, NBA_ID, MLB_ID].join(',')

const colClass = 'gap-4 p-1'

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
        className="bg-canvas-0 sticky top-0 z-10"
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
    `sports-markets-list-${JSON.stringify(fetchProps)}`
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

export default function SportsPage() {
  const user = useUser()
  useSaveReferral(user)
  useSaveScroll('sports', true)

  return (
    <Page trackPageView="/sports" className="!col-span-7">
      <SEO
        title="Sports"
        description="Sports prediction markets"
        url="/sports"
      />
      <Col className="w-full px-2">
        <SportsTabs />
      </Col>
    </Page>
  )
}
