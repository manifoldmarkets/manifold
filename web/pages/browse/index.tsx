import clsx from 'clsx'
import { Group } from 'common/group'
import { buildArray } from 'common/util/array'
import { removeEmojis } from 'common/util/string'
import { uniqBy } from 'lodash'
import { useRouter } from 'next/router'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import { Search } from 'web/components/search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePrivateUser, useUser } from 'web/hooks/use-user'

export default function BrowsePage() {
  return (
    <Page trackPageView={'questions page'}>
      <SEO title={`Browse`} description={`Browse questions`} url={`/browse`} />
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
        headerClassName={'pt-0 px-2 bg-canvas-50'}
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
