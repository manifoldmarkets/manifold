import { TOPIC_KEY, Group, DEFAULT_TOPIC } from 'common/group'
import { uniqBy } from 'lodash'
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
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import Welcome from 'web/components/onboarding/welcome'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import clsx from 'clsx'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useHeaderIsStuck } from 'web/hooks/use-header-is-stuck'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import { ErrorBoundary } from 'react-error-boundary'
import { Onboarding } from 'web/components/onboarding/onboarding'
import { useIsBetOnboardingTest } from 'web/hooks/use-is-bet-onboarding-test'

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
  const bettingOnboarding = useIsBetOnboardingTest()

  useSaveReferral(user)

  const shouldFilterDestiny = false // useShouldBlockDestiny(user?.id)

  const trendingTopics = useTrendingTopics(
    80,
    'home-page-trending-topics'
  ) as Group[]
  const userTrendingTopics = useUserTrendingTopics(user, 50)

  const [topicSlug, setTopicSlug] = usePersistentQueryState<string>(
    TOPIC_KEY,
    DEFAULT_TOPIC,
    true
  )
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
    Group[] | undefined
  >(undefined, `search-topic-results`)

  const currentTopic = topics.find((t) => t.slug === topicSlug)
  const { ref, headerStuck } = useHeaderIsStuck()

  return (
    <>
      {}
      {user &&
        (bettingOnboarding ? (
          <ErrorBoundary fallback={null}>
            <Onboarding />
          </ErrorBoundary>
        ) : (
          <Welcome />
        ))}
      <Page
        trackPageView={'questions page'}
        className="bg-canvas-0 md:bg-canvas-50 lg:col-span-10"
      >
        <SEO
          title={`${currentTopic?.name ?? 'Browse'}`}
          description={`Browse ${currentTopic?.name ?? 'all'} questions`}
          url={`/browse${
            currentTopic ? `?${TOPIC_KEY}=${currentTopic.slug}` : ''
          }`}
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
