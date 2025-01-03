import { APIParams } from 'common/api/schema'
import { FeedCard } from 'components/contract/feed-card'
import { Col } from 'components/layout/col'
import { useEffect, useMemo, useState } from 'react'
import { Text } from 'components/text'
import { View } from 'react-native'
import { useAPIGetter } from 'hooks/use-api-getter'
import { getDefinedContract, pairContracts } from 'lib/contracts'

function MarketsList(props: { fetchProps: APIParams<'search-markets-full'> }) {
  const { fetchProps } = props
  const limit = 10
  const [offset, setOffset] = useState(0)
  const { data, loading } = useAPIGetter(
    'search-markets-full',
    {
      ...fetchProps,
      limit,
      token: 'CASH_AND_MANA',
      contractType: 'BINARY',
      offset,
    },
    ['offset']
  )
  const pairs = useMemo(() => pairContracts(data ?? []), [data])
  useEffect(() => {
    if (data?.length) setOffset(data.length)
  }, [data])

  return (
    <Col>
      {pairs?.map((contractPair) => (
        <FeedCard
          key={getDefinedContract(contractPair).id}
          contractPair={contractPair}
        />
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
