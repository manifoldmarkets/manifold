import { Reaction, ReactionContentTypes, ReactionType } from 'common/reaction'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { run } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { debounce } from 'lodash'

const pendingRequests: Map<ReactionContentTypes, Set<string>> = new Map()
const pendingCallbacks: Map<string, ((data: Reaction[]) => void)[]> = new Map()

const executeBatchLikesQuery = debounce(async (reactionType: ReactionType) => {
  for (const [contentType, contentIds] of pendingRequests.entries()) {
    if (!contentIds.size) continue

    const { data } = await run(
      db
        .from('user_reactions')
        .select()
        .eq('content_type', contentType)
        .eq('reaction_type', reactionType)
        .in('content_id', Array.from(contentIds))
    )

    contentIds.forEach((contentId) => {
      const key = `${contentType}-${contentId}-${reactionType}`
      const callbacks = pendingCallbacks.get(key) || []
      const filteredData = (data || []).filter(
        (item) => item.content_id === contentId
      )
      callbacks.forEach((callback) => callback(filteredData))
      pendingCallbacks.delete(key)
    })

    pendingRequests.delete(contentType)
  }
}, 50)

export const useReactionsOnContent = (
  contentType: ReactionContentTypes,
  contentId: string,
  reactionType: ReactionType
) => {
  const [reactions, setReactions] = usePersistentInMemoryState<
    Reaction[] | undefined
  >(undefined, `${contentType}-${reactionType}-on-${contentId}`)

  useEffect(() => {
    if (!pendingRequests.has(contentType)) {
      pendingRequests.set(contentType, new Set())
    }
    pendingRequests.get(contentType)!.add(contentId)

    const key = `${contentType}-${contentId}`
    if (!pendingCallbacks.has(key)) {
      pendingCallbacks.set(key, [])
    }
    pendingCallbacks.get(key)!.push(setReactions)

    executeBatchLikesQuery(reactionType)

    return () => {
      const callbacks = pendingCallbacks.get(key)
      if (callbacks) {
        const index = callbacks.indexOf(setReactions)
        if (index > -1) {
          callbacks.splice(index, 1)
        }
        if (callbacks.length === 0) {
          pendingCallbacks.delete(key)
        }
      }
    }
  }, [contentType, contentId])

  return reactions
}
