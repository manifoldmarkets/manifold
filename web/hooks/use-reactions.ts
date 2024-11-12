import { Reaction, ReactionContentTypes, ReactionType } from 'common/reaction'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { run } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { debounce } from 'lodash'

// Instead of separate maps, use a compound key that includes the reaction type
const pendingRequests: Map<string, Set<string>> = new Map()
const pendingCallbacks: Map<string, ((data: Reaction[]) => void)[]> = new Map()

const getKey = (
  contentType: ReactionContentTypes,
  contentId: string,
  reactionType: ReactionType
) => {
  return `${contentType}-${contentId}-${reactionType}`
}

const getPendingKey = (
  contentType: ReactionContentTypes,
  reactionType: ReactionType
) => {
  return `${contentType}-${reactionType}`
}

const executeBatchQuery = debounce(
  async (reactionType: ReactionType) => {
    console.log('executeBatchQuery called with:', reactionType)

    // Get all pending keys for this reaction type
    const relevantKeys = Array.from(pendingRequests.keys()).filter((key) =>
      key.endsWith(`-${reactionType}`)
    )
    console.log('Relevant keys:', relevantKeys)
    console.log('All pending keys:', Array.from(pendingRequests.keys()))

    for (const pendingKey of relevantKeys) {
      const [contentType] = pendingKey.split('-')
      const contentIds = pendingRequests.get(pendingKey)
      console.log('Processing key:', pendingKey, 'with contentIds:', contentIds)

      if (!contentIds?.size) continue

      const { data } = await run(
        db
          .from('user_reactions')
          .select()
          .eq('content_type', contentType)
          .eq('reaction_type', reactionType)
          .in('content_id', Array.from(contentIds))
      )

      console.log('DATA', data, reactionType, contentType, contentIds)

      contentIds.forEach((contentId) => {
        const key = getKey(
          contentType as ReactionContentTypes,
          contentId,
          reactionType
        )
        const callbacks = pendingCallbacks.get(key) || []
        const filteredData = (data || []).filter(
          (item) => item.content_id === contentId
        )
        callbacks.forEach((callback) => callback(filteredData))
        pendingCallbacks.delete(key)
      })

      pendingRequests.delete(pendingKey)
    }
  },
  50,
  { leading: true, trailing: true }
)

export const useReactionsOnContent = (
  contentType: ReactionContentTypes,
  contentId: string,
  reactionType: ReactionType
) => {
  console.log('useReactionsOnContent init:', {
    contentType,
    contentId,
    reactionType,
  })

  const [reactions, setReactions] = usePersistentInMemoryState<
    Reaction[] | undefined
  >(undefined, `${contentType}-${reactionType}-on-${contentId}`)

  useEffect(() => {
    const pendingKey = getPendingKey(contentType, reactionType)
    console.log('Setting up effect for:', pendingKey)

    if (!pendingRequests.has(pendingKey)) {
      pendingRequests.set(pendingKey, new Set())
    }
    pendingRequests.get(pendingKey)!.add(contentId)

    console.log('Current pending requests:', new Map(pendingRequests))

    const key = getKey(contentType, contentId, reactionType)
    if (!pendingCallbacks.has(key)) {
      pendingCallbacks.set(key, [])
    }
    pendingCallbacks.get(key)!.push(setReactions)

    executeBatchQuery(reactionType)

    return () => {
      console.log('Cleanup for:', { contentType, contentId, reactionType })
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
  }, [contentType, contentId, reactionType])

  return reactions
}
