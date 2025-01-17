import { APIParams } from 'common/api/schema'
import { FeedCard } from 'components/contract/feed-card'
import { Col } from 'components/layout/col'
import { useEffect, useMemo, useState } from 'react'
import { Text } from 'components/text'
import { View } from 'react-native'
import { useAPIGetter } from 'hooks/use-api-getter'
import { getDefinedContract, pairContracts } from 'lib/contracts'
import { isProd } from 'lib/firebase/init'

const NFL_ID = isProd
  ? 'TNQwmbE5p6dnKx2e6Qlp'
  : '437ba66d-e96c-436e-9227-a5552ea6c555'
const NBA_ID = isProd
  ? 'i0v3cXwuxmO9fpcInVYb'
  : 'a458e68d-d098-46aa-adaa-e6db90e51f34'
const EPL_ID = isProd
  ? '5gsW3dPR3ySBRZCodrgm'
  : '40b1c6e9-4c8f-40df-8908-c03bafaafa2f'
const SPORTS_ID = isProd ? '2hGlgVhIyvVaFyQAREPi' : 'IOffGO7C9c0dfDura9Yn'
const MLB_ID = 'RFwfANk54JSXOwj4qwsW,786nRQzgVyUnuUtaLTGW' // MLB, Baseball
const NHL_ID = isProd
  ? 'lccgApXa1l7O5ZH3XfhH,tYP9jmPPjoX29KfzE4l5' // NHL, Hockey
  : '63cb2aac-11ce-40e5-b2a1-6980d8b21fce' // NHL
const ALL_IDS = [NFL_ID, SPORTS_ID, EPL_ID, NBA_ID, MLB_ID].join(',')

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
      ) : tab == 'news' ? (
        <NewsContent />
      ) : tab == 'entertainment' ? (
        <EntertainmentContent />
      ) : tab == 'politics' ? (
        <PoliticsContent />
      ) : tab == 'test' ? (
        <NewContent />
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
        sort: 'score',
        gids: ALL_IDS,
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

function NewsContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        // TODO: add an ignoreGids to ignore sports, fun, etc.?
      }}
    />
  )
}

const entertainmentGroupIds = [
  'KSeNIu7AWgiBBM5FqVuB', // Movies
  '4QIcUOfCSSha0JZHAg9X', // Celebrities
  'EUSEngFk1dGGBfaMeAmh', // TV and Film
  'eJZecx6r22G2NriYYXcC', // Culture
  'XU1fOYURSnb58lgsqaly', // Entertainment & Pop culture
]

function EntertainmentContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: isProd
          ? entertainmentGroupIds.join(',')
          : '42730330-3904-476f-861f-c4ba083d7199',
      }}
    />
  )
}

function PoliticsContent() {
  return (
    <MarketsList
      fetchProps={{
        term: '',
        filter: 'open',
        sort: 'score',
        gids: isProd
          ? 'AjxQR8JMpNyDqtiqoA96' // US Politics
          : 'iSWHIw6Xo1RkPq4Zh77m',
      }}
    />
  )
}

function NewContent() {
  return (
    <MarketsList
      fetchProps={{
        term: 'test',
        filter: 'open',
        sort: 'newest',
      }}
    />
  )
}
