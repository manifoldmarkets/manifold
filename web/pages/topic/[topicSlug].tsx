import { TopicLeaderboard } from 'web/components/topics/topic-leaderboard'
import { isAdminId, isModId } from 'common/envs/constants'
import { Group, LiteGroup, groupPath } from 'common/group'
import { buildArray } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import router from 'next/router'
import { useState } from 'react'
import { HiOutlineUserGroup } from 'react-icons/hi'
import { SEO } from 'web/components/SEO'
import { JSONEmpty } from 'web/components/contract/contract-description'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Search } from 'web/components/search'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { TopicsSidebar } from 'web/components/topics/topics-sidebar'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api, updateGroup } from 'web/lib/api/api'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { AboutEditor } from 'web/components/topics/about-editor'
import { ActivityLog } from 'web/components/activity-log'
import { removeEmojis } from 'common/util/string'
import { sportsPathForTopic } from 'common/sports-schedule'
import { formatWithCommas } from 'common/util/format'

export async function getStaticProps(ctx: { params: { topicSlug: string } }) {
  const { topicSlug } = ctx.params
  const topic = await getGroupFromSlug(topicSlug)

  if (!topic) {
    return { notFound: true }
  }

  // Sports, and every topic under it, live on the sports pages.
  const { path, known } = await sportsPageForTopic(topic)
  if (path) {
    return {
      redirect: { destination: path, permanent: false },
      // Mods can move a topic in or out of Sports.
      revalidate: 3600,
    }
  }

  const { above, below } = await api('group/:slug/groups', { slug: topicSlug })
  const dashboards = await api('group/:slug/dashboards', { slug: topicSlug })
  const topQuestions = await api('search-markets', {
    sort: 'score',
    topicSlug,
    limit: 3,
  })

  return {
    props: {
      topic: removeUndefinedProps(topic),
      above,
      below,
      dashboards,
      topQuestions: topQuestions.map((m) => m.question),
    },
    // 12 hours, or soon if the sports list was unavailable, so a topic under
    // Sports doesn't stay a topic page for long.
    revalidate: known ? 3600 * 12 : 600,
  }
}

async function sportsPageForTopic(topic: Group) {
  try {
    const index = await api('sports-index', {})
    return { path: sportsPathForTopic(topic, index), known: true }
  } catch (e) {
    // Without the sports list (an older API, or it's down), only Sports
    // itself is known; the rest keep their topic pages until the next try.
    console.error('Could not load the sports index', e)
    return { path: sportsPathForTopic(topic, { sports: [] }), known: false }
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function TopicPage(props: {
  topic: Group
  above: LiteGroup[]
  below: LiteGroup[]
  dashboards: { id: string; title: string; slug: string; creatorId: string }[]
  topQuestions: string[]
}) {
  const { topic, above, below, dashboards, topQuestions } = props

  const isMobile = useIsMobile()

  const user = useUser()
  const privateUser = usePrivateUser()

  // TODO: let members edit
  const canEdit = !!user && (isAdminId(user.id) || isModId(user.id))
  const [addingAbout, setAddingAbout] = useState(false)
  const showAbout =
    addingAbout || (!!topic.about && !JSONEmpty(topic.about)) || isMobile

  return (
    <Page
      trackPageView={'group page'}
      className="!col-span-10 flex grid-cols-10 gap-6 lg:grid"
      hideFooter
    >
      <SEO
        title={topic.name}
        description={`${removeEmojis(topic.name)} odds on Manifold`}
        url={groupPath(topic.slug)}
        ogProps={{
          props: {
            name: topic.name,
            totalMembers: String(topic.totalMembers ?? 0),
            topQuestions,
          },
          endpoint: 'topic',
        }}
      />
      <Col className="col-span-7 px-4 pt-4">
        <QuestionsTopicTitle
          topic={topic}
          addAbout={() => {
            setAddingAbout(true)
            router.replace(groupPath(topic.slug) + '?tab=about')
          }}
        />
        <Details topic={topic} />
        <Col className="w-full">
          <QueryUncontrolledTabs
            className="mb-4"
            labelsParentClassName="gap-1"
            tabs={buildArray(
              {
                title: 'Markets',
                content: (
                  <Search
                    persistPrefix="group-search"
                    additionalFilter={{
                      excludeContractIds: privateUser?.blockedContractIds,
                      excludeUserIds: privateUser?.blockedUserIds,
                    }}
                    contractsOnly
                    defaultFilter="all"
                    defaultSort="score"
                    topicSlug={topic.slug}
                  />
                ),
              },
              {
                title: 'Live',
                content: (
                  <Col className="pt-2">
                    <ActivityLog count={20} topicSlugs={[topic.slug]} />
                  </Col>
                ),
              },
              {
                title: 'Leaderboard',
                content: (
                  <Col className="pt-4">
                    <TopicLeaderboard topicId={topic.id} />
                  </Col>
                ),
              },
              showAbout && {
                title: 'About',
                content: (
                  <Col className="w-full pt-4">
                    <AboutEditor
                      initialContent={topic.about}
                      onSave={(content) => {
                        updateGroup({
                          id: topic.id,
                          about: content,
                        })
                      }}
                      editing={addingAbout}
                      setEditing={setAddingAbout}
                      canEdit={canEdit}
                      modAction={canEdit}
                    />
                    {isMobile && (
                      <TopicsSidebar
                        key={`${topic.id}-mobile`}
                        topicId={topic.id}
                        above={above}
                        below={below}
                        className="mt-6"
                      />
                    )}
                  </Col>
                ),
              }
            )}
          />
        </Col>
      </Col>

      {!isMobile && (
        <TopicsSidebar
          key={topic.id}
          topicId={topic.id}
          above={above}
          below={below}
          className="col-span-3 w-full justify-self-center px-2 pt-4"
        />
      )}
    </Page>
  )
}

const Details = (props: { topic: Group }) => {
  const { topic } = props
  return (
    <Row className="text-ink-500 mb-6 flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <Row className="items-center gap-1.5">
        <HiOutlineUserGroup className="h-4 w-4" />
        <span className="text-ink-700 font-medium">
          {formatWithCommas(topic.totalMembers ?? 0)}
        </span>
        <span>followers</span>
      </Row>
      <span className="text-ink-300">•</span>
      <Row className="items-center gap-1">
        <span className="capitalize">{topic.privacyStatus}</span>
        <span>topic</span>
      </Row>
      <span className="text-ink-300">•</span>
      <Row className="items-center gap-1">
        <span>Created</span>
        <RelativeTimestamp time={topic.createdTime} className="!text-ink-500" />
      </Row>
    </Row>
  )
}
