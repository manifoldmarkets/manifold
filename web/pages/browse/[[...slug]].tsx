import clsx from 'clsx'
import { DESTINY_GROUP_SLUG } from 'common/envs/constants'
import { Group } from 'common/group'
import { removeEmojis } from 'common/util/string'
import { buildArray } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import { first, uniqBy } from 'lodash'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { SEO } from 'web/components/SEO'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import {
  useTrendingTopics,
  useUserTrendingTopics,
} from 'web/components/search/query-topics'
import { SupabaseSearch } from 'web/components/supabase-search'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { Content } from 'web/components/widgets/editor'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import Custom404 from 'web/pages/404'

type TopicParams = {
  name: string
  slug: string
}

export async function getStaticProps(props: { params: { slug: string[] } }) {
  const slug = first(props.params.slug)
  const topic = slug ? await getGroupFromSlug(slug) : null

  if (!topic) {
    return {
      props: {
        slug: slug ?? null,
      },
    }
  }

  if (slug != topic.slug) {
    return {
      redirect: {
        destination: `/browse/${topic.slug}`,
        permanent: true,
      },
    }
  }

  return {
    props: removeUndefinedProps({
      slug: slug ?? null,
      staticTopicParams: {
        name: topic.name,
        slug: topic.slug,
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
  if (!staticTopicParams && slug !== null) {
    return <Custom404 />
  }

  return (
    <>
      <SEO
        title={`${staticTopicParams?.name ?? 'Browse'}`}
        description={`Browse ${staticTopicParams?.name ?? 'all'} questions`}
        url={`/browse${staticTopicParams ? `/${staticTopicParams.slug}` : ''}`}
      />
      <Page trackPageView={'questions page'}>
        <GroupPageContent slug={slug} staticTopicParams={staticTopicParams} />
      </Page>
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
  const privateUser = usePrivateUser()

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

  const setTopicSlugClearQuery = (slug: string) => {
    queryParams.delete('q')
    queryParams.delete('t')
    queryParams.delete('tf')
    const queryStr = queryParams.toString()
    const q = queryStr ? `?${queryStr}` : ''
    router.push(`/browse/${slug}${q}`, undefined, { shallow: true })
  }

  const topicsByImportance = combineGroupsByImportance(
    trendingTopics ?? [],
    userTrendingTopics ?? []
  ).filter((t) => !EXCLUDED_TOPIC_SLUGS.includes(t.slug))

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

  const allTopics = buildArray(topicsFromRouter, topicsByImportance)
  const initialTopics = topicsByImportance

  const currentTopic = allTopics.find((t) => t.slug === topicSlug)
  const staticTopicIsCurrent = staticTopicParams?.slug === currentTopic?.slug

  const searchComponent = (
    <SupabaseSearch
      persistPrefix="search"
      autoFocus={autoFocus}
      additionalFilter={{
        excludeContractIds: privateUser?.blockedContractIds,
        excludeGroupSlugs: buildArray(
          privateUser?.blockedGroupSlugs,
          shouldFilterDestiny &&
            DESTINY_GROUP_SLUG != topicSlug &&
            DESTINY_GROUP_SLUG
        ),
        excludeUserIds: privateUser?.blockedUserIds,
      }}
      useUrlParams
      isWholePage
      headerClassName={'pt-0 px-2 bg-canvas-50'}
      topicSlug={topicSlug}
      defaultFilter="open"
      defaultSort="score"
      defaultForYou="1"
      initialTopics={initialTopics}
      setTopicSlug={(slug) => {
        setTopicSlugClearQuery(slug === topicSlug ? '' : slug)
      }}
    />
  )

  return (
    <div>
      <QuestionsTopicTitle
        currentTopic={currentTopic}
        topicSlug={topicSlug}
        user={user}
        setTopicSlug={setTopicSlugClearQuery}
      />
      <div className="flex md:contents">
        <Col className={clsx('relative col-span-8 mx-auto w-full')}>
          {!currentTopic && searchComponent}
          {currentTopic && (
            <QueryUncontrolledTabs
              className={'px-1'}
              renderAllTabs={false}
              tabs={buildArray(
                {
                  content: searchComponent,
                  title: 'Browse',
                },
                currentTopic && [
                  {
                    title: 'About',
                    content: (
                      <Col className="w-full">
                        {currentTopic.bannerUrl && (
                          <div className="relative h-[200px]">
                            <Image
                              fill
                              src={currentTopic.bannerUrl}
                              sizes="100vw"
                              className="object-cover"
                              alt=""
                            />
                          </div>
                        )}
                        <div className="text-ink-500 mb-4 mt-2 text-sm">
                          {currentTopic.privacyStatus} topic created
                          {currentTopic.creatorId === user?.id && ' by you'}
                          <RelativeTimestamp
                            time={currentTopic.createdTime}
                            className="!text-ink-500"
                          />{' '}
                          • {currentTopic.totalMembers ?? 0} followers
                        </div>

                        {currentTopic.about && (
                          <Content
                            size="lg"
                            className="p-4 sm:p-6"
                            content={currentTopic.about}
                          />
                        )}
                      </Col>
                    ),
                  },
                ]
              )}
            />
          )}
        </Col>
      </div>
    </div>
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

const useFirstSlugFromRouter = () => {
  const router = useRouter()
  const { slug } = router.query
  if (!router.isReady) return undefined
  return first(slug) ?? ''
}
