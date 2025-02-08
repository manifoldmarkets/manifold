import clsx from 'clsx'
import { Group } from 'common/group'
import { buildArray } from 'common/util/array'
import { removeEmojis } from 'common/util/string'
import { uniqBy } from 'lodash'
import { useRouter } from 'next/router'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import { Search } from 'web/components/search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'

export default function BrowsePage() {
  const user = useUser()

  return (
    <Page trackPageView={'questions page'} className="lg:px-4">
      {/* only show logo on mobile, since there's no sidebar */}
      {!user && <ManifoldLogo className="m-2 flex lg:hidden" />}
      <div className="lg:mb-4"></div>

      <BrowsePageContent />
    </Page>
  )
}

export function BrowsePageContent() {
  const user = useUser()
  const isMobile = useIsMobile()
  const router = useRouter()
  const { q } = router.query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q
  const privateUser = usePrivateUser()

  // const shouldFilterDestiny = useShouldBlockDestiny(user?.id)

  const trendingTopics = useTrendingTopics(
    50,
    'home-page-trending-topics'
  ) as Group[]
  const userTrendingTopics = useUserTrendingTopics(user, 25)

  const topicsByImportance = combineGroupsByImportance(
    trendingTopics ?? [],
    userTrendingTopics ?? []
  ).filter((t) => !EXCLUDED_TOPIC_SLUGS.includes(t.slug))

  const initialTopics = topicsByImportance

  return (
    <Col className={clsx('relative col-span-8 mx-auto w-full')}>
      <Search
        showTopicsFilterPills
        persistPrefix="search"
        autoFocus={autoFocus}
        additionalFilter={{
          excludeContractIds: privateUser?.blockedContractIds,
          excludeGroupSlugs: buildArray(
            privateUser?.blockedGroupSlugs
            // shouldFilterDestiny &&
            //   DESTINY_GROUP_SLUG != topicSlug &&
            //   DESTINY_GROUP_SLUG
          ),
          excludeUserIds: privateUser?.blockedUserIds,
        }}
        useUrlParams
        isWholePage
        headerClassName={'pt-0 px-2'}
        defaultFilter="open"
        defaultSort="score"
        defaultForYou="1"
        initialTopics={initialTopics}
      />
    </Col>
  )
}

const EXCLUDED_TOPIC_SLUGS = [
  'politics-default',
  '2024-us-presidential-election',
]

const combineGroupsByImportance = (
  resultGroups: Group[],
  myGroups: Group[]
) => {
  const combined = [
    ...myGroups,
    ...resultGroups.filter((g) => !myGroups.map((g) => g.id).includes(g.id)),
  ]

  return uniqBy(combined, (g) => removeEmojis(g.name).toLowerCase())
}
