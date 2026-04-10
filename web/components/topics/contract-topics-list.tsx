import clsx from 'clsx'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { PlusCircleIcon, SearchIcon, TagIcon } from '@heroicons/react/outline'
import { XIcon } from '@heroicons/react/solid'

import { Group, LiteGroup, Topic, MAX_GROUPS_PER_MARKET } from 'common/group'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { TopicTag } from 'web/components/topics/topic-tag'
import { useUser } from 'web/hooks/use-user'
import { CreateTopicModal } from './create-topic-modal'
import { PRIVACY_STATUS_ITEMS } from './topic-privacy-modal'
import { useSearchGroups } from './topic-selector'

export function ContractTopicsList(props: {
  canEdit: boolean
  canEditTopic: (groupId: string) => boolean
  topics: Topic[]
  addTopic: (topic: Topic) => Promise<void>
  removeTopic: (topic: Topic) => Promise<void>
}) {
  const { canEditTopic, canEdit, topics, addTopic, removeTopic } = props
  const user = useUser()

  const [error, setError] = useState('')
  const [isCreatingTopic, setIsCreatingTopic] = useState(false)

  const { query, setQuery, searchedGroups, loading } = useSearchGroups(true)

  const atMax = topics.length >= MAX_GROUPS_PER_MARKET

  const selectedIds = new Set(topics.map((t) => t.id))
  const filteredGroups = searchedGroups.filter((g) => !selectedIds.has(g.id))

  const handleAdd = (group: LiteGroup) => {
    addTopic(group as Group).catch((e) => {
      console.error(e.message)
      setError(e.message)
    })
  }

  return (
    <Col className="gap-4">
      <Row className="items-center gap-2">
        <TagIcon className="text-ink-500 h-5 w-5" />
        <span className="text-ink-1000 text-lg font-semibold">Topics</span>
        <span className="text-ink-400 text-sm">
          {topics.length}/{MAX_GROUPS_PER_MARKET}
        </span>
      </Row>

      {topics.length === 0 ? (
        <div className="text-ink-400 border-ink-200 rounded-md border border-dashed py-6 text-center text-sm">
          No topics yet. Add topics to help people find this market.
        </div>
      ) : (
        <Row className="flex-wrap gap-2">
          {topics.map((t) => (
            <TopicTag
              location={'categories list'}
              key={t.id}
              topic={t}
              className="bg-ink-100 hover:bg-ink-200"
            >
              {canEditTopic(t.id) && (
                <button
                  className="text-ink-400 hover:text-ink-700 hover:bg-ink-200 ml-0.5 rounded-full p-0.5 transition-colors"
                  onClick={() => {
                    toast.promise(removeTopic(t), {
                      loading: `Removing "${t.name}"…`,
                      success: `Removed "${t.name}"`,
                      error: `Error removing topic. Try again?`,
                    })
                  }}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </TopicTag>
          ))}
        </Row>
      )}

      {canEdit && (
        <Col className="gap-2">
          <div className="relative">
            <SearchIcon
              className={clsx(
                'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                atMax ? 'text-ink-300' : 'text-ink-400'
              )}
            />
            <input
              type="text"
              disabled={atMax}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                atMax
                  ? `Limit of ${MAX_GROUPS_PER_MARKET} topics reached`
                  : 'Search topics...'
              }
              className={clsx(
                'bg-canvas-0 w-full rounded-md border py-2.5 pl-9 pr-4 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1',
                atMax
                  ? 'border-ink-200 text-ink-400 cursor-not-allowed'
                  : 'border-ink-300 placeholder-ink-400 hover:border-ink-400 focus:border-primary-500 focus:ring-primary-500'
              )}
            />
          </div>

          <Col className="border-ink-200 divide-ink-100 h-52 divide-y overflow-y-auto rounded-md border">
            {atMax ? (
              <div className="text-ink-400 flex h-full items-center justify-center text-sm">
                Remove a topic above to add more.
              </div>
            ) : loading ? (
              <>
                <LoadingRow className="w-3/4" />
                <LoadingRow className="w-1/2" />
                <LoadingRow className="w-3/4" />
              </>
            ) : filteredGroups.length === 0 && query.length > 0 ? (
              <div className="text-ink-400 px-4 py-3 text-sm">
                No matching topics found
              </div>
            ) : (
              filteredGroups.map((group) => (
                <button
                  key={group.id}
                  className="hover:bg-primary-50 flex flex-shrink-0 items-center justify-between px-4 py-2.5 text-left transition-colors"
                  onClick={() => handleAdd(group)}
                >
                  <span className="text-ink-900 truncate text-sm">
                    {group.name}
                  </span>
                  <Row className="flex-shrink-0 items-center gap-2">
                    <span className="text-ink-400 text-xs">
                      {group.totalMembers} followers
                    </span>
                    {group.privacyStatus !== 'public' && (
                      <span className="text-ink-400">
                        {PRIVACY_STATUS_ITEMS[group.privacyStatus].icon}
                      </span>
                    )}
                  </Row>
                </button>
              ))
            )}

            {!atMax && user && !loading && (
              <button
                className="text-ink-700 hover:bg-primary-50 flex flex-shrink-0 items-center gap-2 px-4 py-2.5 transition-colors"
                onClick={() => setIsCreatingTopic(true)}
              >
                <PlusCircleIcon className="h-4 w-4 text-teal-500" />
                <span className="text-sm">Create a new topic</span>
              </button>
            )}
          </Col>

          {error && <span className="text-error text-sm">{error}</span>}
        </Col>
      )}

      {isCreatingTopic && (
        <CreateTopicModal
          user={user}
          startingTitle={query}
          open={isCreatingTopic}
          setOpen={setIsCreatingTopic}
          onCreate={(group) => {
            handleAdd(group)
            setIsCreatingTopic(false)
          }}
        />
      )}
    </Col>
  )
}

function LoadingRow(props: { className: string }) {
  return (
    <div className="flex w-full animate-pulse items-center px-4 py-2.5">
      <div className={clsx('bg-ink-200 h-4 rounded-full', props.className)} />
    </div>
  )
}
