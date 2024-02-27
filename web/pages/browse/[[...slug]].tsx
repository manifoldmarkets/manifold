import { Group, LiteGroup } from 'common/group'
import { first, uniqBy } from 'lodash'
import { useEffect, useState } from 'react'
import { TopicsList } from 'web/components/topics/topics-list'
import { Col } from 'web/components/layout/col'
import { removeEmojis } from 'common/topics'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { buildArray } from 'common/util/array'
import {
  BLOCKED_BY_DEFAULT_GROUP_SLUGS,
  DESTINY_GROUP_SLUGS,
} from 'common/envs/constants'
import { SupabaseSearch } from 'web/components/supabase-search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { FilterIcon } from '@heroicons/react/outline'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import {
  useTopicFromRouter,
  useFirstSlugFromRouter,
} from 'web/hooks/use-topic-from-router'
import Welcome from 'web/components/onboarding/welcome'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import clsx from 'clsx'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { User } from 'common/user'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { getUser, getUsers } from 'web/lib/supabase/user'
import Custom404 from 'web/pages/404'
import { removeUndefinedProps } from 'common/util/object'
const NON_GROUP_SLUGS = ['for-you', 'recent']

type TopicParams = {
  group: Group
  creator: User
  topTraders: { user: User; score: number }[]
  topCreators: { user: User; score: number }[]
}
const toTopUsers = async (
  cachedUserIds: { userId: string; score: number }[]
): Promise<{ user: User | null; score: number }[]> => {
  const userData = await getUsers(cachedUserIds.map((u) => u.userId))
  const usersById = Object.fromEntries(userData.map((u) => [u?.id, u as User]))
  return cachedUserIds
    .map((e) => ({
      user: usersById[e.userId],
      score: e.score,
    }))
    .filter((e) => e.user != null)
}

export async function getStaticProps(props: { params: { slug: string[] } }) {
  const slug = first(props.params.slug)
  const group =
    slug && !NON_GROUP_SLUGS.includes(slug)
      ? await getGroupFromSlug(slug)
      : null
  if (!group || group.privacyStatus === 'private') {
    return {
      props: {
        slug: slug ?? null,
      },
    }
  }

  const creatorPromise = getUser(group.creatorId)
  const cachedTopTraderIds = group.cachedLeaderboard?.topTraders ?? []
  const cachedTopCreatorIds = group.cachedLeaderboard?.topCreators ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)
  const topCreators = await toTopUsers(cachedTopCreatorIds)
  const creator = await creatorPromise

  return {
    props: removeUndefinedProps({
      slug: slug ?? null,
      topicParams: {
        topic: group ?? null,
        creator: creator ?? null,
        topTraders: topTraders ?? [],
        topCreators: topCreators ?? [],
      },
      revalidate: 60, // regenerate after a minute
    }),
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function BrowseGroupPage(props: {
  slug: string
  topicParams?: TopicParams
}) {
  const { slug, topicParams } = props
  if (!topicParams && slug !== null && !NON_GROUP_SLUGS.includes(slug)) {
    return <Custom404 />
  }
  return <GroupPageContent slug={slug} topicParams={topicParams} />
}

export function GroupPageContent(props: {
  topicParams?: TopicParams
  slug: string | null
}) {
  const slug = props.slug ?? undefined
  const user = useUser()
  const isMobile = useIsMobile()
  const router = useRouter()
  const { q } = router.query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q
  const [showTopicsSidebar, setShowTopicsSidebar] = useState<boolean>(false)
  const privateUser = usePrivateUser()

  useSaveReferral(user)

  const shouldFilterDestiny = false // useShouldBlockDestiny(user?.id)

  const trendingTopics = useTrendingTopics(
    80,
    'home-page-trending-topics'
  ) as Group[]
  const userTrendingTopics = useUserTrendingTopics(user, 50)

  const topicSlug = useFirstSlugFromRouter() ?? slug
  const setTopicSlug = (slug: string) => {
    router.push(`/browse/${slug}`, undefined, { shallow: true })
  }
  const topicsByImportance = combineGroupsByImportance(
    trendingTopics ?? [],
    userTrendingTopics ?? []
  )
  const topicFromRouter = useTopicFromRouter(topicSlug)
  const [topicsFromRouter, setTopicsFromRouter] = usePersistentInMemoryState<
    Group[]
  >([], 'topics-from-router')

  useEffect(() => {
    const newTopic =
      topicFromRouter &&
      !topicsByImportance.map((g) => g.id).includes(topicFromRouter.id) &&
      !topicsFromRouter.map((g) => g.id).includes(topicFromRouter.id)
    if (newTopic) setTopicsFromRouter((topics) => [...topics, topicFromRouter])
  }, [topicFromRouter])

  const topics = buildArray(topicsFromRouter, topicsByImportance)
  const [topicResults, setTopicResults] = usePersistentInMemoryState<
    LiteGroup[] | undefined
  >(undefined, `search-topic-results`)

  const currentTopic = topics.find((t) => t.slug === topicSlug)
  const { ref, headerStuck } = useHeaderIsStuck()

  return (
    <>
      {user && <Welcome />}
      <Page
        trackPageView={'questions page'}
        className="bg-canvas-0 md:bg-canvas-50 lg:col-span-10"
      >
        <SEO
          title={`${currentTopic?.name ?? 'Browse'}`}
          description={`Browse ${currentTopic?.name ?? 'all'} questions`}
          url={`/browse${currentTopic ? `/${currentTopic.slug}` : ''}`}
        />

        <div className={'md:grid md:grid-cols-10'}>
          <QuestionsTopicTitle
            currentTopic={currentTopic}
            topicSlug={topicSlug}
            user={user}
            setTopicSlug={setTopicSlug}
            ref={ref}
          />
          <div className="flex md:contents">
            <Col
              className={clsx(
                'relative col-span-8 mx-auto w-full xl:col-span-7'
              )}
            >
              <SupabaseSearch
                persistPrefix="search"
                autoFocus={autoFocus}
                additionalFilter={{
                  excludeContractIds: privateUser?.blockedContractIds,
                  excludeGroupSlugs: buildArray(
                    privateUser?.blockedGroupSlugs,
                    shouldFilterDestiny &&
                      !DESTINY_GROUP_SLUGS.includes(topicSlug ?? '') &&
                      DESTINY_GROUP_SLUGS,
                    !user && BLOCKED_BY_DEFAULT_GROUP_SLUGS
                  ),
                  excludeUserIds: privateUser?.blockedUserIds,
                }}
                useUrlParams
                isWholePage
                showTopicTag={headerStuck}
                headerClassName={'pt-0 px-2 bg-canvas-0 md:bg-canvas-50'}
                topics={topicResults}
                setTopics={setTopicResults}
                topicSlug={topicSlug}
                defaultTopic={slug}
                menuButton={
                  showTopicsSidebar ? null : (
                    <Button
                      color={'gray-outline'}
                      size={'md'}
                      className={
                        'ml-1 hidden sm:ml-2 sm:flex sm:w-[12rem] md:hidden'
                      }
                      onClick={() => setShowTopicsSidebar(!showTopicsSidebar)}
                    >
                      <FilterIcon className="mr-2 h-5 w-5" />
                      Topics
                    </Button>
                  )
                }
                rowBelowFilters={
                  isMobile && (
                    <BrowseTopicPills
                      className={'relative w-full pb-1 sm:hidden'}
                      topics={topics}
                      currentTopicSlug={topicSlug}
                      setTopicSlug={(slug) =>
                        setTopicSlug(slug === topicSlug ? '' : slug)
                      }
                    />
                  )
                }
              />
            </Col>
            {!isMobile && (
              <TopicsList
                key={'groups' + topics.length}
                topics={q && topicResults?.length ? topicResults : topics}
                currentTopicSlug={topicSlug}
                setCurrentTopicSlug={setTopicSlug}
                privateUser={privateUser}
                user={user}
                show={showTopicsSidebar}
                setShow={setShowTopicsSidebar}
                className={clsx('col-span-2 w-[12rem] md:w-full xl:col-span-3')}
              />
            )}
          </div>
        </div>
      </Page>
    </>
  )
}

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
