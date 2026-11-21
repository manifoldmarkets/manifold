import clsx from 'clsx'
import { Group } from 'common/group'
import { uniqBy } from 'lodash'
import { ReactNode, useState } from 'react'

import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { useTrendingTopics } from 'web/components/search/query-topics'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { useBrowseTopics } from './browse-topics'
import { TopicRow } from './market-card'

// One place to review and change what browse shows: followed topics feed
// "For you" and the Followed filter; hidden topics never appear on browse.
export function YourTopicsModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen } = props
  const topics = useBrowseTopics()
  const trending = useTrendingTopics(40, 'browse-v2-trending-topics')
  const [picked, setPicked] = useState<Group[]>([])

  const suggestions = (trending ?? [])
    .filter((g) => !topics.isFollowing(g.slug) && !topics.isHidden(g.slug))
    .filter((g) => !picked.some((p) => p.id === g.id))
    .slice(0, 12)

  return (
    <Modal
      open={open}
      setOpen={setOpen}
      size="md"
      ariaLabel="Your topics"
      className={clsx(
        'bg-canvas-0 text-ink-1000 flex flex-col gap-5 rounded-xl px-4 py-5 sm:px-6',
        SCROLLABLE_MODAL_CLASS
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-ink-1000 m-0 text-xl font-semibold">Your topics</h2>
        <p className="text-ink-600 m-0 text-sm">
          Topics you follow shape <b>For you</b> and the <b>Followed topics</b>{' '}
          filter. Hidden topics never show up on browse.
        </p>
      </div>

      <TopicSelector
        addingToContract={false}
        placeholder="Find a topic to follow or hide"
        setSelectedGroup={(g) =>
          setPicked((prev) => uniqBy([g, ...prev], 'id').slice(0, 5))
        }
      />
      {picked.length > 0 && (
        <TopicList>
          {picked.map((g) => (
            <TopicRow key={g.id} topic={g} className="py-1.5" />
          ))}
        </TopicList>
      )}

      <Section
        title="Following"
        count={topics.followed?.length}
        empty="You don't follow any topics yet. Follow a few below and For you will lean on them."
      >
        {topics.followed?.map((g) => (
          <TopicRow key={g.slug} topic={g} className="py-1.5" />
        ))}
      </Section>

      <Section
        title="Hidden"
        count={topics.hidden?.length}
        empty="Nothing hidden. Use Hide here or in a market's ⋯ menu to keep a topic off your browse page."
      >
        {topics.hidden?.map((g) => (
          <TopicRow key={g.slug} topic={g} className="py-1.5" hideFollow />
        ))}
      </Section>

      {suggestions.length > 0 && (
        <Section title="Popular topics" count={undefined} empty="">
          {suggestions.map((g) => (
            <TopicRow key={g.id} topic={g} className="py-1.5" />
          ))}
        </Section>
      )}
    </Modal>
  )
}

function Section(props: {
  title: string
  count: number | undefined
  empty: string
  children: ReactNode
}) {
  const { title, count, empty, children } = props
  const isEmpty = count === 0
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-ink-900 m-0 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
        {title}
        {count !== undefined && count > 0 && (
          <span className="bg-ink-100 text-ink-700 rounded-full px-2 text-xs font-medium normal-case tracking-normal">
            {count}
          </span>
        )}
      </h3>
      {isEmpty ? (
        <p className="text-ink-500 m-0 text-sm">{empty}</p>
      ) : (
        <TopicList>{children}</TopicList>
      )}
    </section>
  )
}

function TopicList(props: { children: ReactNode }) {
  return (
    <div className="divide-ink-100 dark:divide-ink-200 flex flex-col divide-y">
      {props.children}
    </div>
  )
}
