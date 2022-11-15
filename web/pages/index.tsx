import { useEffect } from 'react'
import Router from 'next/router'

import { Page } from 'web/components/layout/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useGlobalConfig } from 'web/hooks/use-global-config'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Post } from 'common/post'
import { ActivitySection, FeaturedSection, SearchSection } from './home'
import { Sort } from 'web/components/contract-search'
import { ContractCard } from 'web/components/contract/contract-card'
import { PostCard } from 'web/components/posts/post-card'
import {
  useContractsByDailyScoreNotBetOn,
  useTrendingContracts,
} from 'web/hooks/use-contracts'
import { trendingIndex } from 'web/lib/service/algolia'
import { CPMMBinaryContract, Contract } from 'common/contract'
import { sortBy } from 'lodash'
import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const trending = await trendingIndex.search<CPMMBinaryContract>('', {
    facetFilters: ['isResolved:false', 'visibility:public'].concat([
      'groupSlugs:-destinygg',
    ]),
    hitsPerPage: 10,
  })
  const trendingPossiblyWithDestiny =
    await trendingIndex.search<CPMMBinaryContract>('', {
      facetFilters: ['isResolved:false', 'visibility:public'],
      hitsPerPage: 10,
    })
  const destinyMarket = trendingPossiblyWithDestiny.hits.filter((c) =>
    c.groupSlugs?.includes('destinygg')
  )
  // add one destiny market to trending
  if (destinyMarket.length > 0) trending.hits.push(destinyMarket[0])

  return {
    props: {
      hotContracts: sortBy(trending.hits, (c) => -(c.popularityScore ?? 0)),
    },
  }
})

export default function Home() {
  useSaveReferral()
  useRedirectAfterLogin()

  const blockedFacetFilters = DESTINY_GROUP_SLUGS.map(
    (slug) => `groupSlugs:-${slug}`
  )

  const globalConfig = useGlobalConfig()
  const trendingContracts = useTrendingContracts(6, blockedFacetFilters)
  const dailyTrendingContracts = useContractsByDailyScoreNotBetOn(
    6,
    blockedFacetFilters
  )
  const [pinned, setPinned] = usePersistentState<JSX.Element[] | null>(null, {
    store: inMemoryStore(),
    key: 'home-pinned',
  })

  useEffect(() => {
    const pinnedItems = globalConfig?.pinnedItems
    if (pinnedItems) {
      const itemComponents = pinnedItems.map((element) => {
        if (element.type === 'post') {
          const post = element.item as Post
          return <PostCard post={post} pinned={true} />
        } else if (element.type === 'contract') {
          const contract = element.item as Contract
          return <ContractCard contract={contract} pinned={true} />
        }
      })
      setPinned(
        itemComponents.filter(
          (element) => element != undefined
        ) as JSX.Element[]
      )
    }
  }, [globalConfig, setPinned])
  const isLoading =
    !trendingContracts || !globalConfig || !pinned || !dailyTrendingContracts
  return (
    <Page>
      <SEO
        title="Manifold Markets"
        description="Create a play-money prediction market on any topic you care about
            and bet with your friends on what will happen!"
      />
      <Col className="mx-auto mb-8 max-w-3xl gap-8 px-4">
        <LandingPagePanel />
        {isLoading ? (
          <LoadingIndicator />
        ) : (
          <>
            <SearchSection
              key={'score'}
              label={'Trending'}
              contracts={trendingContracts}
              sort={'score' as Sort}
              icon={'🔥'}
            />
            <SearchSection
              key={'daily-trending'}
              label={'Daily changed'}
              contracts={dailyTrendingContracts}
              sort={'daily-score'}
              icon={'📈'}
            />
            <ActivitySection key={'live-feed'} />
            <FeaturedSection
              key={'featured'}
              globalConfig={globalConfig}
              pinned={pinned}
              isAdmin={false}
            />
          </>
        )}
      </Col>
    </Page>
  )
}

const useRedirectAfterLogin = () => {
  const user = useUser()

  useEffect(() => {
    if (user) {
      Router.replace('/home')
    }
  }, [user])
}
