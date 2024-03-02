import { DEBUG_FEED_CARDS, FeedTimelineItem } from 'web/hooks/use-feed-timeline'
import { filterDefined } from 'common/util/array'
import { useState } from 'react'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { sum } from 'lodash'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { track } from 'web/lib/service/analytics'

export const FeedItemFrame = (props: {
  item: FeedTimelineItem | undefined
  children: React.ReactNode
  className?: string
  moreItems?: FeedTimelineItem[]
}) => {
  const { moreItems, item, children, className } = props
  const items = filterDefined([item, ...(moreItems ?? [])])
  const [seenStart, setSeenStart] = useState(0)
  const [seenDuration, setSeenDuration] = usePersistentInMemoryState(
    sum(items.map((i) => i.seenDuration ?? 0)),
    `feed-items-${items
      .map((i) => i.id)
      .sort()
      .join('-')}-seen-duration`
  )

  const { ref } = useIsVisible(
    () => {
      if (DEBUG_FEED_CARDS) return
      const start = seenStart
      setSeenStart(Date.now())
      if (start === 0 && !item?.seenTime) {
        items.forEach(async (i) => {
          run(
            db
              .from('user_feed')
              .update({ seen_time: new Date().toISOString() })
              .eq('id', i.id)
          )
          track('view feed item', { id: i.id, type: i.dataType })
        })
      }
    },
    false,
    items.length > 0,
    () => {
      if (DEBUG_FEED_CARDS) return
      const newSeenDuration =
        (Date.now() - seenStart) / items.length + seenDuration
      items.forEach(async (i) => {
        run(
          db
            .from('user_feed')
            .update({ seen_duration: newSeenDuration })
            .eq('id', i.id)
        )
      })
      setSeenDuration(newSeenDuration)
    }
  )

  return (
    <div className={className} ref={ref}>
      {children}
    </div>
  )
}
