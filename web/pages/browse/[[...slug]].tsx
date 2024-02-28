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
  HOUSE_BOT_USERNAME,
} from 'common/envs/constants'
import { SupabaseSearch } from 'web/components/supabase-search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useRouter } from 'next/router'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import Welcome from 'web/components/onboarding/welcome'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import clsx from 'clsx'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { BETTORS, User } from 'common/user'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { getUser, getUsers } from 'web/lib/supabase/user'
import Custom404 from 'web/pages/404'
import { removeUndefinedProps } from 'common/util/object'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { Leaderboard } from 'web/components/leaderboard'
import { formatMoney } from 'common/util/format'
import LoadingUserRows from 'manifold-politics/components/loading/loading-user-rows'
import { Title } from 'web/components/widgets/title'
const NON_GROUP_SLUGS = ['for-you', 'recent']

type UserStat = { user: User; score: number }
type TopicParams = {
  topic: Group
  creator: User
  topTraders: UserStat[]
  topCreators: UserStat[]
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
  const topic =
    slug && !NON_GROUP_SLUGS.includes(slug)
      ? await getGroupFromSlug(slug)
      : null
  if (!topic || topic.privacyStatus === 'private') {
    return {
      props: {
        slug: slug ?? null,
      },
    }
  }

  const creatorPromise = getUser(topic.creatorId)
  const cachedTopTraderIds = topic.cachedLeaderboard?.topTraders ?? []
  const cachedTopCreatorIds = topic.cachedLeaderboard?.topCreators ?? []
  const topTraders = await toTopUsers(cachedTopTraderIds)
  const topCreators = await toTopUsers(cachedTopCreatorIds)
  const creator = await creatorPromise

  return {
    props: removeUndefinedProps({
      slug: slug ?? null,
      staticTopicParams: {
        topic,
        creator,
        topTraders: topTraders ?? [],
        topCreators: topCreators ?? [],
      },
      revalidate: 60 * 10, // regenerate after 10 minutes
    }),
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function BrowseGroupPage(props: {
  slug: string
  staticTopicParams?: TopicParams
}) {
  const { slug, staticTopicParams } = props
  if (!staticTopicParams && slug !== null && !NON_GROUP_SLUGS.includes(slug)) {
    return <Custom404 />
  }
  const topic = staticTopicParams?.topic
  return (
    <>
      <SEO
        title={`${topic?.name ?? 'Browse'}`}
        description={`Browse ${topic?.name ?? 'all'} questions`}
        url={`/browse${topic ? `/${topic.slug}` : ''}`}
      />
      <GroupPageContent slug={slug} staticTopicParams={staticTopicParams} />
    </>
  )
}

export function GroupPageContent(props: {
  staticTopicParams?: TopicParams
  slug: string | null
}) {
  const { staticTopicParams } = props
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
    50,
    'home-page-trending-topics'
  ) as Group[]
  const userTrendingTopics = useUserTrendingTopics(user, 25)

  const topicSlug = useFirstSlugFromRouter() ?? slug
  const { slug: _, ...otherQueryParams } = router.query
  const queryParams = new URLSearchParams(
    otherQueryParams as Record<string, string>
  )
  const setTopicSlug = (slug: string) => {
    router.push(`/browse/${slug}?${queryParams}`, undefined, { shallow: true })
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
  const staticTopicIsCurrent =
    staticTopicParams?.topic.slug === currentTopic?.slug
  // TODO: Overtly prompt users to follow topic, maybe w/ bottom bar
  return (
    <>
      {user && <Welcome />}
      <Page
        trackPageView={'questions page'}
        className="bg-canvas-0 md:bg-canvas-50 lg:col-span-10"
      >
        <div className={'md:grid md:grid-cols-10'}>
          <QuestionsTopicTitle
            currentTopic={currentTopic}
            topicSlug={topicSlug}
            user={user}
            setTopicSlug={setTopicSlug}
            ref={ref}
          />
          <BrowseTopicPills
            className={'relative w-full py-1 pl-1 md:hidden'}
            topics={topics}
            currentTopicSlug={topicSlug}
            setTopicSlug={(slug) =>
              setTopicSlug(slug === topicSlug ? '' : slug)
            }
          />
          <div className=" flex md:contents">
            <Col
              className={clsx(
                'relative col-span-8 mx-auto w-full xl:col-span-7'
              )}
            >
              <QueryUncontrolledTabs
                className={'mb-2 px-1'}
                renderAllTabs={false}
                tabs={buildArray(
                  {
                    content: (
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
                        headerClassName={
                          'pt-0 px-2 bg-canvas-0 md:bg-canvas-50'
                        }
                        topics={topicResults}
                        setTopics={setTopicResults}
                        topicSlug={topicSlug}
                      />
                    ),
                    title: 'Browse',
                  },
                  currentTopic &&
                    !NON_GROUP_SLUGS.includes(currentTopic.slug) && {
                      title: 'Leaderboards',
                      content: (
                        <Col className={''}>
                          <div className="text-ink-500 mb-4 text-sm">
                            Updates every 15 minutes
                          </div>
                          <Col className="gap-2 ">
                            <GroupLeaderboard
                              topic={currentTopic}
                              type={'trader'}
                              cachedTopUsers={
                                staticTopicIsCurrent
                                  ? staticTopicParams?.topTraders
                                  : undefined
                              }
                            />
                            <GroupLeaderboard
                              topic={currentTopic}
                              type={'creator'}
                              cachedTopUsers={
                                staticTopicIsCurrent
                                  ? staticTopicParams?.topCreators
                                  : undefined
                              }
                              noFormatting={true}
                            />
                          </Col>
                        </Col>
                      ),
                    }
                )}
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
const MAX_LEADERBOARD_SIZE = 50

function GroupLeaderboard(props: {
  topic: Group
  type: 'creator' | 'trader'
  cachedTopUsers: UserStat[] | undefined
  noFormatting?: boolean
}) {
  const { type, topic, cachedTopUsers, noFormatting } = props

  const title = type === 'trader' ? `🏅 Top ${BETTORS}` : `🏅 Top creators`
  const header = type === 'trader' ? 'Profit' : 'Traders'
  const uncachedTopUsers =
    (type === 'trader'
      ? topic.cachedLeaderboard?.topTraders
      : topic.cachedLeaderboard?.topCreators) ?? []
  const topUsers = (
    cachedTopUsers ?? // eslint-disable-next-line react-hooks/rules-of-hooks
    useToTopUsers(uncachedTopUsers) ??
    []
  ).filter((u) => u.user.username !== HOUSE_BOT_USERNAME)
  const scoresByUser = Object.fromEntries(
    topUsers.map((u) => [u.user.id, u.score])
  )
  if (!topUsers.length) {
    return (
      <Col className={'px-1'}>
        <Title>{title}</Title>
        <LoadingUserRows />
      </Col>
    )
  }

  return (
    <Leaderboard
      entries={topUsers.map((t) => t.user)}
      title={title}
      columns={[
        {
          header,
          renderCell: (user) =>
            noFormatting
              ? scoresByUser[user.id]
              : formatMoney(scoresByUser[user.id]),
        },
      ]}
      maxToShow={MAX_LEADERBOARD_SIZE}
    />
  )
}

function useToTopUsers(
  userScores: { userId: string; score: number }[]
): UserStat[] | null {
  const [topUsers, setTopUsers] = useState<UserStat[]>([])
  useEffect(() => {
    if (topUsers) setTopUsers([])
    toTopUsers(userScores).then((result) => setTopUsers(result as UserStat[]))
  }, [userScores])
  return topUsers && topUsers.length > 0 ? topUsers : null
}

const useFirstSlugFromRouter = () => {
  const router = useRouter()
  const { slug } = router.query
  return first(slug)
}
