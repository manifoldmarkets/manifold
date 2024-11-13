import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { isAdminId, isModId } from 'common/envs/constants'
import { Group, groupPath } from 'common/group'
import { removeUndefinedProps } from 'common/util/object'
import Link from 'next/link'
import { useState } from 'react'
import { BsPeopleFill } from 'react-icons/bs'
import { Button, IconButton } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { SupabaseSearch } from 'web/components/supabase-search'
import { QuestionsTopicTitle } from 'web/components/topics/questions-topic-title'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { Content } from 'web/components/widgets/editor'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { getGroupFromSlug } from 'web/lib/supabase/group'
import { SEO } from 'web/components/SEO'

export async function getStaticProps(ctx: { params: { topicSlug: string } }) {
  const { topicSlug } = ctx.params
  const topic = await getGroupFromSlug(topicSlug)

  if (!topic) {
    return { notFound: true }
  }

  const { above, below } = await api('group/:slug/groups', { slug: topicSlug })

  return {
    props: {
      topic: removeUndefinedProps(topic),
      above,
      below,
    },
    revalidate: 240,
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function TopicPage(props: {
  topic: Group
  above: Group[]
  below: Group[]
}) {
  const { topic, above, below } = props

  const privateUser = usePrivateUser()

  return (
    <Page
      trackPageView={'group page'}
      className="col-span-10 grid grid-cols-10 gap-4"
      hideFooter
    >
      <SEO
        title={topic.name}
        description="hi"
        // description={topic.about}
        url={groupPath(topic.slug)}
      />
      <Col className="col-span-7">
        {/* {topic.bannerUrl && (
            <div className="relative h-[200px]">
              <Image
                fill
                src={topic.bannerUrl}
                sizes="100vw"
                className="object-cover"
                alt=""
              />
            </div>
          )} */}
        <QuestionsTopicTitle topic={topic} />
        <Details topic={topic} />
        <Col className="w-full">
          <QueryUncontrolledTabs
            tabs={[
              {
                title: 'About',
                content: (
                  <Col className="w-full">
                    {topic.about && (
                      <Content
                        size="lg"
                        className="p-4 sm:p-6"
                        content={topic.about}
                      />
                    )}
                  </Col>
                ),
              },
              {
                title: 'Questions',
                content: (
                  <SupabaseSearch
                    headerClassName={'pt-4 bg-canvas-50'}
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
            ]}
          />
        </Col>
      </Col>

      <TopicsSidebar
        key={topic.id}
        topicId={topic.id}
        above={above}
        below={below}
        className="col-span-3 w-full justify-self-center px-2"
      ></TopicsSidebar>
    </Page>
  )
}

const Details = (props: { topic: Group }) => {
  const { topic } = props
  return (
    <div className="text-ink-500 mb-4 text-sm">
      {topic.privacyStatus} topic created
      <RelativeTimestamp
        time={topic.createdTime}
        className="!text-ink-500"
      /> • {topic.totalMembers ?? 0} followers
    </div>
  )
}

const TopicsSidebar = (props: {
  topicId: string
  above: Group[]
  below: Group[]
  className?: string
  children?: React.ReactNode
}) => {
  // for optimistic updates
  const [above, setAbove] = useState(props.above)
  const [below, setBelow] = useState(props.below)

  const onAddAbove = (topic: Group) => {
    setAbove([...above, topic])
    api('group/by-id/:topId/group/:bottomId', {
      topId: topic.id,
      bottomId: props.topicId,
    })
  }

  const onRemoveAbove = (topic: Group) => {
    setAbove(above.filter((g) => g.id !== topic.id))
    api('group/by-id/:topId/group/:bottomId', {
      topId: props.topicId,
      bottomId: topic.id,
      remove: true,
    })
  }

  const onAddBelow = (topic: Group) => {
    setBelow([...below, topic])
    api('group/by-id/:topId/group/:bottomId', {
      topId: props.topicId,
      bottomId: topic.id,
    })
  }

  const onRemoveBelow = (topic: Group) => {
    setBelow(below.filter((g) => g.id !== topic.id))
    api('group/by-id/:topId/group/:bottomId', {
      topId: topic.id,
      bottomId: props.topicId,
      remove: true,
    })
  }

  // for topic search
  const [addingAbove, setAddingAbove] = useState(false)
  const [addingBelow, setAddingBelow] = useState(false)

  const user = useUser()
  const canEdit = !!user && (isAdminId(user.id) || isModId(user.id))

  return (
    <Col className={clsx(props.className, 'gap-1')}>
      <h2 className="font-semibold">Main topic</h2>

      {above.map((t) => (
        <TopicRow
          key={t.id}
          topic={t}
          onRemove={canEdit ? onRemoveBelow : undefined}
        />
      ))}

      {canEdit &&
        (addingAbove ? (
          <TopicSelector
            setSelectedGroup={(group) => onAddAbove(group)}
            placeholder="Add main topic"
            selectedIds={above.map((g) => g.id)}
            onCreateTopic={(group) => setAbove((a) => [...a, group])}
            addingToContract={false}
            className="[&_input]:bg-canvas-50 focus:[&_input]:bg-canvas-0"
          />
        ) : (
          <Button
            size="xs"
            color="gray-white"
            className="!justify-start"
            onClick={() => setAddingAbove(true)}
          >
            + Add main topic
          </Button>
        ))}

      <h2 className="font-semibold">Sub-topics</h2>

      {below.map((t) => (
        <TopicRow
          key={t.id}
          topic={t}
          onRemove={canEdit ? onRemoveAbove : undefined}
        />
      ))}

      {canEdit &&
        (addingBelow ? (
          <TopicSelector
            setSelectedGroup={(group) => onAddBelow(group)}
            placeholder="Add sub-topic"
            selectedIds={below.map((g) => g.id)}
            onCreateTopic={(group) => setBelow((b) => [...b, group])}
            addingToContract={false}
            className="[&_input]:bg-canvas-50 focus:[&_input]:bg-canvas-0"
          />
        ) : (
          <Button
            size="xs"
            color="gray-white"
            className="!justify-start"
            onClick={() => setAddingBelow(true)}
          >
            + Add sub-topic
          </Button>
        ))}
      {props.children}
    </Col>
  )
}

const TopicRow = (props: {
  topic: Group
  onRemove?: (topic: Group) => void
}) => {
  const { topic, onRemove } = props
  return (
    <Link
      className="hover:bg-primary-100 active:bg-primary-200 group flex items-center gap-2 rounded-md px-2 py-1 transition-colors"
      href={groupPath(topic.slug)}
    >
      <div className="text-ink-900 group-hover:text-primary-700 mr-auto truncate">
        {topic.name}
      </div>
      <div className="text-ink-500 group-hover:text-ink-600 flex gap-1 text-sm">
        <BsPeopleFill className="h-4 w-4" /> {topic.totalMembers ?? 0}
      </div>
      {onRemove && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onRemove(topic)
          }}
        >
          <XIcon className="h-4 w-4" />
        </IconButton>
      )}
    </Link>
  )
}
