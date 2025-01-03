import { APIParams } from 'common/api/schema'
import { FeedCard } from 'components/contract/feed-card'
import { Col } from 'components/layout/col'
import { api } from 'lib/api'
import { useEffect, useState } from 'react'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { uniqBy } from 'lodash'
import { Text } from 'components/text'
import { View } from 'react-native'
import { Contract } from 'common/contract'
import { useTokenMode } from 'hooks/use-token-mode'
function MarketsList(props: { fetchProps: APIParams<'search-markets-full'> }) {
  const { fetchProps } = props
  const limit = 10
  const [loading, setLoading] = useState(false)
  const { token } = useTokenMode()

  const [data, setData] = usePersistentInMemoryState<{
    markets: Contract[]
    cashOffset: number
  }>(
    { markets: [], cashOffset: 0 },
    `markets-list-${JSON.stringify(fetchProps)}`
  )
  // We could also find all the sweeps markets, then when we run out, show mana markets
  const loadMore = async () => {
    if (loading) return
    setLoading(true)
    try {
      const cashMarkets = await api('search-markets-full', {
        ...fetchProps,
        token,
        limit,
        contractType: 'BINARY',
        offset: data.cashOffset,
      })

      setData({
        markets: uniqBy([...data.markets, ...cashMarkets], 'id'),
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
    // {
    //   title: 'Live Soon',
    //   Component: LiveSoonContent,
    // },
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
