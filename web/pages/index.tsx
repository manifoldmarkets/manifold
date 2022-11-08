import { useEffect } from 'react'
import Router from 'next/router'

import { Contract, getTrendingContracts } from 'web/lib/firebase/contracts'
import { Page } from 'web/components/layout/page'
import { LandingPagePanel } from 'web/components/landing-page-panel'
import { Col } from 'web/components/layout/col'
import { redirectIfLoggedIn } from 'web/lib/firebase/server-auth'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { SEO } from 'web/components/SEO'
import { useUser } from 'web/hooks/use-user'
import { useAllPosts } from 'web/hooks/use-post'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useGlobalConfig } from 'web/hooks/use-global-config'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Post } from 'common/post'
import {
  ActivitySection,
  FeaturedSection,
  LatestPostsSection,
  SearchSection,
} from './home'
import { Sort } from 'web/components/contract-search'
import { ContractCard } from 'web/components/contract/contract-card'
import { PostCard } from 'web/components/posts/post-card'
import { useTrendingContracts } from 'web/hooks/use-contracts'
export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const hotContracts = await getTrendingContracts()
  return { props: { hotContracts } }
})

export default function Home() {
  useSaveReferral()
  useRedirectAfterLogin()

  const globalConfig = useGlobalConfig()
  const trendingContracts = useTrendingContracts(6)
  const latestPosts = useAllPosts(true)
    // Remove "test" posts.
    .filter((p) => !p.title.toLocaleLowerCase().split(' ').includes('test'))
    .slice(0, 2)

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
    !trendingContracts || !latestPosts || !globalConfig || !pinned
  return (
    <Page>
      <SEO
        title="Manifold Markets"
        description="Create a play-money prediction market on any topic you care about
            and bet with your friends on what will happen!"
      />
      <Col className="pm:mx-10 gap-4 px-4 pb-8 pt-4 sm:pt-0">
        <Col className="max-w-3xl gap-8">
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
              <ActivitySection key={'live-feed'} />
              <FeaturedSection
                key={'featured'}
                globalConfig={globalConfig}
                pinned={pinned}
                isAdmin={false}
              />
              <LatestPostsSection
                key={'latest-posts'}
                latestPosts={latestPosts}
              />
            </>
          )}
        </Col>
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
