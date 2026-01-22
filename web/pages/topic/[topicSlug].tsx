import { XIcon } from '@heroicons/react/outline'
import { TopicLeaderboard } from 'web/components/topics/topic-leaderboard'
import clsx from 'clsx'
import { isAdminId, isModId } from 'common/envs/constants'
import { Group, LiteGroup, groupPath } from 'common/group'
import { buildArray } from 'common/util/array'
import { removeUndefinedProps } from 'common/util/object'
import Link from 'next/link'
import router from 'next/router'
import { useState } from 'react'
import { BsPeopleFill } from 'react-icons/bs'
import { HiOutlineUserGroup } from 'react-icons/hi'
import { SEO } from 'web/components/SEO'
import { IconButton } from 'web/components/buttons/button'
import { JSONEmpty } from 'web/components/contract/contract-description'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Search } from 'web/components/search'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api, updateGroup } from 'web/lib/api/api'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { AboutEditor } from 'web/components/topics/about-editor'
import { ActivityLog } from 'web/components/activity-log'
import { removeEmojis } from 'common/util/string'
import { formatWithCommas } from 'common/util/format'

export async function getStaticProps(ctx: { params: { topicSlug: string } }) {
  const { topicSlug } = ctx.params
  const topic = await getGroupFromSlug(topicSlug)

  if (!topic) {
    return { notFound: true }
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
    revalidate: 3600 * 12, // 12 hours
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

const TopicsSidebar = (props: {
  topicId: string
  above: LiteGroup[]
  below: LiteGroup[]
  className?: string
  children?: React.ReactNode
}) => {
  // for optimistic updates
  const [above, setAbove] = useState(props.above)
  const [below, setBelow] = useState(props.below)

  const onAddAbove = (topic: LiteGroup) => {
    setAbove([...above, topic])
    api('group/by-id/:topId/group/:bottomId', {
      topId: topic.id,
      bottomId: props.topicId,
    })
  }

  const onRemoveAbove = (topic: LiteGroup) => {
    setAbove(above.filter((g) => g.id !== topic.id))
    api('group/by-id/:topId/group/:bottomId', {
      topId: topic.id,
      bottomId: props.topicId,
      remove: true,
    })
  }

  const onAddBelow = (topic: LiteGroup) => {
    setBelow([...below, topic])
    api('group/by-id/:topId/group/:bottomId', {
      topId: props.topicId,
      bottomId: topic.id,
    })
  }

  const onRemoveBelow = (topic: LiteGroup) => {
    setBelow(below.filter((g) => g.id !== topic.id))
    api('group/by-id/:topId/group/:bottomId', {
      topId: props.topicId,
      bottomId: topic.id,
      remove: true,
    })
  }

  const user = useUser()
  const canEdit = !!user && (isAdminId(user.id) || isModId(user.id))

  return (
    <Col className={clsx(props.className, 'gap-4')}>
      {/* Main Topics Section */}
      <Col className="bg-canvas-0 border-ink-200 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-ink-100 bg-canvas-50 border-b px-4 py-3">
          <h2 className="text-ink-700 text-sm font-semibold uppercase tracking-wide">
            {above.length > 0 ? 'Main topic' : 'Top-level topic'}
          </h2>
        </div>
        <Col className="divide-ink-100 divide-y">
          {above.length > 0 ? (
            above.map((t) => (
              <TopicRow
                key={t.id}
                topic={t}
                onRemove={canEdit ? onRemoveAbove : undefined}
              />
            ))
          ) : (
            <div className="text-ink-400 px-4 py-3 text-sm">
              This is a top-level topic
            </div>
          )}
        </Col>
        {canEdit && (
          <div className="border-ink-100 border-t px-3 py-2">
            <TopicSelector
              setSelectedGroup={(group) => onAddAbove(group)}
              placeholder="Add main topic..."
              selectedIds={above.map((g) => g.id)}
              onCreateTopic={(group) => setAbove((a) => [...a, group])}
              addingToContract={false}
              className="[&_input]:bg-canvas-0 [&_input]:text-sm focus:[&_input]:bg-canvas-0"
            />
          </div>
        )}
      </Col>

      {/* Subtopics Section */}
      <Col className="bg-canvas-0 border-ink-200 overflow-hidden rounded-xl border shadow-sm">
        <div className="border-ink-100 bg-canvas-50 border-b px-4 py-3">
          <h2 className="text-ink-700 text-sm font-semibold uppercase tracking-wide">
            Subtopics
          </h2>
        </div>
        <Col className="divide-ink-100 divide-y">
          {below.length > 0 ? (
            below.map((t) => (
              <TopicRow
                key={t.id}
                topic={t}
                onRemove={canEdit ? onRemoveBelow : undefined}
              />
            ))
          ) : (
            <div className="text-ink-400 px-4 py-3 text-sm">
              No subtopics yet
            </div>
          )}
        </Col>
        {canEdit && (
          <div className="border-ink-100 border-t px-3 py-2">
            <TopicSelector
              setSelectedGroup={(group) => onAddBelow(group)}
              placeholder="Add subtopic..."
              selectedIds={below.map((g) => g.id)}
              onCreateTopic={(group) => setBelow((b) => [...b, group])}
              addingToContract={false}
              className="[&_input]:bg-canvas-0 [&_input]:text-sm focus:[&_input]:bg-canvas-0"
            />
          </div>
        )}
      </Col>

      {props.children}
    </Col>
  )
}

const TopicRow = (props: {
  topic: LiteGroup
  onRemove?: (topic: LiteGroup) => void
}) => {
  const { topic, onRemove } = props
  return (
    <Link
      className="hover:bg-canvas-50 group flex items-center gap-3 px-4 py-3 transition-colors"
      href={groupPath(topic.slug)}
    >
      <div className="text-ink-800 group-hover:text-primary-600 min-w-0 flex-1 truncate text-sm font-medium transition-colors">
        {topic.name}
      </div>
      <Row className="text-ink-400 group-hover:text-ink-500 w-20 flex-shrink-0 items-center justify-start gap-1 text-xs tabular-nums transition-colors">
        <BsPeopleFill className="h-3.5 w-3.5" />
        <span>{formatWithCommas(topic.totalMembers ?? 0)}</span>
      </Row>
      {onRemove && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onRemove(topic)
          }}
          className="text-ink-400 hover:text-ink-600 -mr-1 opacity-0 transition-opacity group-hover:opacity-100"
          size="xs"
        >
          <XIcon className="h-4 w-4" />
        </IconButton>
      )}
    </Link>
  )
}
