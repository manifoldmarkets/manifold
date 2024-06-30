import { Reaction, ReactionContentTypes } from 'common/reaction'
import { db } from 'web/lib/supabase/db'
import { useEffect } from 'react'
import { run } from 'common/supabase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

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
    
    const handleCommentUpdate = (msg: ServerMessage<'comment_update'>) => {
      if (msg.data.comment_id === contentId) {
        setLikes(msg.data.likes)
      }
    }
    
    const subscription = useApiSubscription({
      topics: [`comment:${contentId}`],
      onBroadcast: handleCommentUpdate,
    })
    
    return () => {
      subscription.unsubscribe()
    }
  }, [contentType, contentId])

  return likes
}
