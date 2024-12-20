import { APIParams } from 'common/api/schema'
import { FeedCard } from 'components/contract/FeedCard'
import { Col } from 'components/layout/col'
import { api } from 'lib/api'
import { useEffect, useState } from 'react'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { orderBy } from 'lodash'
import { uniqBy } from 'lodash'
import { Text } from 'components/text'
import { View } from 'react-native'
function MarketsList(
  props: {
    fetchProps: APIParams<'search-markets-full'>
  } & { sweepScoreBoost?: number }
) {
  const { sweepScoreBoost, fetchProps } = props
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
  // We could also find all the sweeps markets, then when we run out, show mana markets
  const loadMore = async () => {
    if (loading) return false
    setLoading(true)
    try {
      const [manaMarkets, cashMarkets] = await Promise.all([
        api('search-markets-full', {
          ...fetchProps,
          token: 'MANA',
          limit,
          contractType: 'BINARY',
          offset: data.manaOffset,
        }),
        api('search-markets-full', {
          ...fetchProps,
          token: 'CASH',
          limit,
          contractType: 'BINARY',
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
      return true
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
    <Col>
      {data.markets.map((contract) => (
        <FeedCard key={contract.id} contract={contract} />
      ))}
      <View className="relative">{loading && <Text>Loading...</Text>}</View>
    </Col>
  )
}

export function Feed({ tab }: { tab: string }) {
  // TODO: Grab appropriate contracts for each tab
  const content = [
    {
      title: 'Live Soon',
      Component: LiveSoonContent,
    },
    {
      title: 'Forecasts',
      Component: ForecastsContent,
    },
    {
      title: 'NFL',
      Component: NFLContent,
    },
    {
      title: 'NBA',
      Component: NBAContent,
    },
    {
      title: 'EPL',
      Component: EPLContent,
    },
    {
      title: 'MLB',
      Component: MLBContent,
    },
    {
      title: 'NHL',
      Component: NHLContent,
    },
  ]
  return (
    <Col>
      {content.map((c) => (
        <Col key={c.title}>
          <Text>{c.title}</Text>
          <c.Component />
        </Col>
      ))}
    </Col>
  )
}

function LiveSoonContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'closing-day',
        sort: 'close-date',
        // gids: ALL_IDS,
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
        // gids: ALL_IDS,
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
        // gids: NFL_ID,
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
        // gids: NBA_ID,
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
        // gids: EPL_ID,
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
        // gids: MLB_ID,
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
        // gids: NHL_ID,
      }}
    />
  )
}
