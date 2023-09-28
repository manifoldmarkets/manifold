import { TOPIC_KEY, Group, DEFAULT_TOPIC } from 'common/group'
import { orderBy, uniqBy } from 'lodash'
import { useEffect, useState } from 'react'
import { TopicsList } from 'web/components/topics/topics-list'
import { Col } from 'web/components/layout/col'
import { removeEmojis } from 'common/topics'
import {
  usePrivateUser,
  useShouldBlockDestiny,
  useUser,
} from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { buildArray } from 'common/util/array'
import {
  BLOCKED_BY_DEFAULT_GROUP_SLUGS,
  DESTINY_GROUP_SLUGS,
} from 'common/envs/constants'
import { SupabaseContractSearch } from 'web/components/contracts-search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { MenuIcon } from '@heroicons/react/outline'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import { useGroupFromRouter } from 'web/hooks/use-group-from-router'
import Welcome from 'web/components/onboarding/welcome'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import clsx from 'clsx'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export const SHOW_TOPICS_TERM = 'show-topics'

// TODO: use static props for non for-you topic slugs
export default function QuestionsPage() {
  const user = useUser()
  const isMobile = useIsMobile()
  const router = useRouter()
  const { q } = router.query
  // Allow users to browse without keyboard popping up on mobile.
  const autoFocus = !isMobile && !q
  const [showTopicsSidebar, setShowTopicsSidebar] = useState<boolean>(false)
  const privateUser = usePrivateUser()

  const shouldFilterDestiny = useShouldBlockDestiny(user?.id)

  const trendingTopics = useTrendingTopics(
    80,
    'home-page-trending-topics'
  ) as Group[]
  const userTrendingTopics = useUserTrendingTopics(user, 20)

  const [topicSlug, setTopicSlug] = usePersistentQueryState<string>(
    TOPIC_KEY,
    DEFAULT_TOPIC
  )
  const topicsByImportance = combineGroupsByImportance(
    trendingTopics ?? [],
    userTrendingTopics ?? []
  )
  const topicFromRouter = useGroupFromRouter(topicSlug)
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
  const currentTopic = topics.find((t) => t.slug === topicSlug)

  const menuButton = showTopicsSidebar ? null : (
    <Button
      color={'gray-outline'}
      size={'md'}
      className={
        'ml-1 hidden w-[8rem] sm:ml-2 sm:flex md:w-[10.5rem] xl:hidden'
      }
      onClick={() => setShowTopicsSidebar(!showTopicsSidebar)}
    >
      <MenuIcon className="mr-2 h-5 w-5" />
      Topics
    </Button>
  )

  return (
    <>
      {user && <Welcome />}
      <Page
        trackPageView={'questions page'}
        rightSidebar={
          !isMobile && (
            <TopicsList
              key={'groups' + topics.length}
              topics={topics}
              currentTopicSlug={topicSlug}
              setCurrentTopicSlug={setTopicSlug}
              privateUser={privateUser}
              user={user}
              show={true}
              setShow={() => {}}
              className={'hidden xl:flex'}
            />
          )
        }
      >
        <SEO
          title={`${currentTopic?.name ?? 'Questions'}`}
          description={`Browse ${currentTopic?.name ?? 'all'} questions`}
          url={`/questions${
            currentTopic ? `?${TOPIC_KEY}=${currentTopic.slug}` : ''
          }`}
        />
        <QuestionsTopicTitle
          currentTopic={currentTopic}
          topicSlug={topicSlug}
          user={user}
        />
        <Col>
          <Row className={'w-full'}>
            <Col
              className={clsx(
                'relative w-full',
                showTopicsSidebar ? 'sm:mr-10 lg:mr-0' : ''
              )}
            >
              <SupabaseContractSearch
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
                headerClassName={'bg-canvas-0 lg:bg-canvas-50 pt-2 px-2'}
                menuButton={menuButton}
                hideAvatar={false}
                rowBelowFilters={
                  isMobile && (
                    <BrowseTopicPills
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
                className={'xl:hidden'}
                key={'groups' + topics.length}
                topics={topics}
                currentTopicSlug={topicSlug}
                setCurrentTopicSlug={setTopicSlug}
                privateUser={privateUser}
                user={user}
                show={showTopicsSidebar}
                setShow={setShowTopicsSidebar}
              />
            )}
          </Row>
        </Col>
      </Page>
    </>
  )
}

const combineGroupsByImportance = (
  resultGroups: Group[],
  myGroups: Group[]
) => {
  const combined = orderBy(
    [
      ...myGroups.map((g) => ({
        ...g,
        importanceScore: g.importanceScore * 1.1,
      })),
      ...resultGroups.filter((g) => !myGroups.map((g) => g.id).includes(g.id)),
    ],
    'importanceScore',
    'desc'
  )

  return uniqBy(combined, (g) => removeEmojis(g.name).toLowerCase())
}
