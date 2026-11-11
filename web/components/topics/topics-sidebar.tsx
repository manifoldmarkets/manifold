import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { BsPeopleFill } from 'react-icons/bs'
import { isAdminId, isModId } from 'common/envs/constants'
import { LiteGroup, groupPath } from 'common/group'
import { formatWithCommas } from 'common/util/format'
import { IconButton } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import {
  MOD_ACTION_TEXT_CLASS,
  ModActionBadge,
} from 'web/components/moderation/mod-action'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

/** A topic's main topics and subtopics, which mods can add to and remove. */
export const TopicsSidebar = (props: {
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
          <Row className="border-ink-100 items-center gap-2 border-t px-3 py-2">
            <ModActionBadge className={MOD_ACTION_TEXT_CLASS} />
            <TopicSelector
              setSelectedGroup={(group) => onAddAbove(group)}
              placeholder="Add main topic..."
              selectedIds={above.map((g) => g.id)}
              onCreateTopic={(group) => setAbove((a) => [...a, group])}
              addingToContract={false}
              className="[&_input]:bg-canvas-0 focus:[&_input]:bg-canvas-0 [&_input]:text-sm"
            />
          </Row>
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
          <Row className="border-ink-100 items-center gap-2 border-t px-3 py-2">
            <ModActionBadge className={MOD_ACTION_TEXT_CLASS} />
            <TopicSelector
              setSelectedGroup={(group) => onAddBelow(group)}
              placeholder="Add subtopic..."
              selectedIds={below.map((g) => g.id)}
              onCreateTopic={(group) => setBelow((b) => [...b, group])}
              addingToContract={false}
              className="[&_input]:bg-canvas-0 focus:[&_input]:bg-canvas-0 [&_input]:text-sm"
            />
          </Row>
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
      {/* Only mods can remove parent/subtopics */}
      {onRemove && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onRemove(topic)
          }}
          className={clsx(
            '-mr-1 opacity-0 transition-opacity group-hover:opacity-100',
            MOD_ACTION_TEXT_CLASS
          )}
          size="xs"
        >
          <XIcon className="h-4 w-4" />
        </IconButton>
      )}
    </Link>
  )
}
