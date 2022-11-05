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
import { ContractsGrid } from 'web/components/contract/contracts-grid'
import { keyBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import { getGlobalConfig } from 'web/lib/firebase/globalConfig'
import { useTrendingContracts } from 'web/hooks/use-contracts'
import { useTrendingGroups } from 'web/hooks/use-group'
import { useAllPosts } from 'web/hooks/use-post'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { useGlobalConfig } from 'web/hooks/use-global-config'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { CPMMBinaryContract } from 'common/contract'
import { GlobalConfig } from 'common/globalConfig'
import { ContractMetrics } from 'common/calculate-metrics'
import { Post } from 'common/post'
import { TrendingGroupsSection } from './home'

const LANDING_PAGE_SECTIONS = [
  { label: 'Trending', id: 'score', icon: '🔥' },
  { label: 'Daily changed', id: 'daily-trending', icon: '📈' },
  { label: 'Live feed', id: 'live-feed', icon: '🔴' },
  { label: 'Featured', id: 'featured', icon: '⭐' },
  { label: 'Latest posts', id: 'latest-posts', icon: '📝' },
] as const

export const getLandingPageItems = (sections: string[]) => {
  const itemsById = keyBy(LANDING_PAGE_SECTIONS, 'id')
  const sectionItems = filterDefined(sections.map((id) => itemsById[id]))

  // Add unmentioned items to the end.
  sectionItems.push(
    ...LANDING_PAGE_SECTIONS.filter((item) => !sectionItems.includes(item))
  )
  return {
    sections: sectionItems,
    itemsById,
  }
}

export const getServerSideProps = redirectIfLoggedIn('/home', async (_) => {
  const hotContracts = await getTrendingContracts()
  return { props: { hotContracts } }
})

export default function Home(props: { hotContracts: Contract[] }) {
  const { hotContracts } = props

  useSaveReferral()
  useRedirectAfterLogin()

  const globalConfig = useGlobalConfig()
  const trendingContracts = useTrendingContracts(6)
  const trendingGroups = useTrendingGroups()
  const latestPosts = useAllPosts(true)
    // Remove "test" posts.
    .filter((p) => !p.title.toLocaleLowerCase().split(' ').includes('test'))
    .slice(0, 2)

  const [pinned, setPinned] = usePersistentState<JSX.Element[] | null>(null, {
    store: inMemoryStore(),
    key: 'home-pinned',
  })

  const isLoading = !trendingContracts || !globalConfig || !pinned

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
              {/* {renderSections(
              sections,
              {
                score: trendingContracts,
                newest: newContracts,
                'daily-trending': dailyTrendingContracts,
              },
              isAdmin,
              globalConfig,
              pinned,
              contractMetricsByProfit,
              latestPosts
            )} */}

              {/* {groups && groupContracts && trendingGroups.length > 0 ? (
              <>
                <TrendingGroupsSection
                  className="mb-4"
                  user={user}
                  myGroups={groups}
                  trendingGroups={trendingGroups}
                />
                <GroupSections
                  user={user}
                  groups={groups}
                  groupContracts={groupContracts}
                />
              </>
            ) : (
              <LoadingIndicator />
            )} */}
              <ContractsGrid contracts={hotContracts} />
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
