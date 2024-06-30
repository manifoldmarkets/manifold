import { Reaction, ReactionContentTypes } from 'common/reaction'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { run } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { ServerMessage } from 'common/api/websockets' // Add this line
import { useApiSubscription } from './use-api-subscription' // Add this line

export const useLikesOnContent = (
  contentType: ReactionContentTypes,
  contentId: string
) => {
  const [likes, setLikes] = usePersistentInMemoryState<Reaction[] | undefined>(
    undefined,
    `${contentType}-likes-on-${contentId}`
  )

  useEffect(() => {
    run(
      db
        .from('user_reactions')
        .select()
        .eq('content_type', contentType)
        .eq('content_id', contentId)
    ).then(({ data }) => setLikes(data))
    
    const handleNewLike = (msg: ServerMessage<'new-like'>) => {
      if (msg.data && msg.data.comment_id === contentId) {
        setLikes(msg.data.likes)
      }
    }
    
    const subscription = useApiSubscription({
      topics: [`contract/${contentId}/updated-comment`],
      onBroadcast: handleNewLike,
    })
    
    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [contentType, contentId])

  return likes
}
