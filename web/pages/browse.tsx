import { TOPIC_KEY, Group, DEFAULT_TOPIC } from 'common/group'
import { uniqBy } from 'lodash'
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
import { SupabaseSearch } from 'web/components/supabase-search'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { useRouter } from 'next/router'
import { Button } from 'web/components/buttons/button'
import { FilterIcon } from '@heroicons/react/outline'
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
export default function BrowsePage() {
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
  const userTrendingTopics = useUserTrendingTopics(user, 50)

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

  return (
    <>
      {user && <Welcome />}
      <Page trackPageView={'questions page'} className="lg:col-span-10">
        <SEO
          title={`${currentTopic?.name ?? 'Browse'}`}
          description={`Browse ${currentTopic?.name ?? 'all'} questions`}
          url={`/browse${
            currentTopic ? `?${TOPIC_KEY}=${currentTopic.slug}` : ''
          }`}
        />
        <QuestionsTopicTitle
          currentTopic={currentTopic}
          topicSlug={topicSlug}
          user={user}
        />
        <Col className={'w-full'}>
          <Row className={'lg:grid lg:grid-cols-12'}>
            <Col className={clsx('relative lg:col-span-8')}>
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
                headerClassName={'bg-canvas-0 lg:bg-canvas-50 pt-0 px-2'}
                menuButton={
                  showTopicsSidebar ? null : (
                    <Button
                      color={'gray-outline'}
                      size={'md'}
                      className={
                        'ml-1 hidden sm:ml-2 sm:flex sm:w-[8rem] md:w-[12rem] lg:hidden'
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
                topics={topics}
                currentTopicSlug={topicSlug}
                setCurrentTopicSlug={setTopicSlug}
                privateUser={privateUser}
                user={user}
                show={showTopicsSidebar}
                setShow={setShowTopicsSidebar}
                className={clsx(
                  'col-span-3 min-w-[7rem] sm:min-w-[8rem]  md:min-w-[10.5rem] lg:ml-3 xl:ml-8'
                )}
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
  const combined = [
    ...myGroups,
    ...resultGroups.filter((g) => !myGroups.map((g) => g.id).includes(g.id)),
  ]

  return uniqBy(combined, (g) => removeEmojis(g.name).toLowerCase())
}
