import { Reaction } from 'common/reaction'
import { sum } from 'lodash'
import { useEffect } from 'react'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useAPIGetter } from './use-api-getter'

export const useVotesOnComment = (
  contentType: 'comment',
  commentId: string
) => {
  const [votes, setVotes] = usePersistentInMemoryState<
    { reactions: Reaction[]; upvotes: number; downvotes: number } | undefined
  >(undefined, `${contentType}-votes-on-${commentId}`)

  const { data } = useAPIGetter('get-comment-votes', {
    contentType,
    commentId,
  })

  useEffect(() => {
    if (data) {
      const reactions = data
      const upvotes = sum(
        reactions.map((r) => (r.reaction_type === 'upvote' ? 1 : 0))
      )
      const downvotes = sum(
        reactions.map((r) => (r.reaction_type === 'downvote' ? 1 : 0))
      )

      setVotes({ reactions, upvotes, downvotes })
    }
  }, [data, setVotes])

  return votes
}
