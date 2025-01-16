import { APIParams } from 'common/api/schema'
import { FeedCard } from 'components/contract/feed-card'
import { Col } from 'components/layout/col'
import { useEffect, useMemo, useState } from 'react'
import { Text } from 'components/text'
import { View } from 'react-native'
import { useAPIGetter } from 'hooks/use-api-getter'
import { getDefinedContract, pairContracts } from 'lib/contracts'
import { isProd } from 'lib/firebase/init'

const SPORTS_ID = isProd ? '2hGlgVhIyvVaFyQAREPi' : 'IOffGO7C9c0dfDura9Yn'

function MarketsList(props: { fetchProps: APIParams<'search-markets-full'> }) {
  const { fetchProps } = props
  const limit = 20
  const [offset, setOffset] = useState(0)
  const { data, loading } = useAPIGetter(
    'search-markets-full',
    {
      ...fetchProps,
      limit,
      token: 'CASH_AND_MANA',
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
  // TODO: obviously flush this out
  return (
    <Col>
      {tab == 'live' ? (
        <LiveSoonContent />
      ) : tab == 'NFL' ? (
        <NFLContent />
      ) : tab == 'NBA' ? (
        <NBAContent />
      ) : tab == 'EPL' ? (
        <EPLContent />
      ) : tab == 'MLB' ? (
        <MLBContent />
      ) : tab == 'NHL' ? (
        <NHLContent />
      ) : (
        <ForecastsContent />
      )}
    </Col>
  )
}

function LiveSoonContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'closing-week',
        sort: 'start-time',
        gids: SPORTS_ID,
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
        sort: 'newest',
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
