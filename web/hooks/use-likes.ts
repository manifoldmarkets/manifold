import { collection, query, where } from 'firebase/firestore'
import { users } from 'web/lib/firebase/users'
import { listenForValues } from 'web/lib/firebase/utils'
import { Reaction, ReactionContentTypes } from 'common/reaction'
import { useStore } from 'web/hooks/use-store'

export const useUserLikes = (
  userId: string | undefined,
  contentType: ReactionContentTypes
) => {
  return useStore<Reaction[] | undefined>(
    `user-likes-${userId}-${contentType}`,
    (_, setReactions) => {
      return listenForLikes(userId??'_', contentType, setReactions)
    }
  )
}

export const useIsLiked = (
  userId: string | undefined,
  contentType: ReactionContentTypes,
  contentId: string
) => {
  const likes = useUserLikes(userId, contentType)
  return likes?.some((like) => like.contentId === contentId) ?? false
}

function listenForLikes(
  userId: string,
  contentType: ReactionContentTypes,
  setLikes: (likes: Reaction[]) => void
) {
  const likes = query(
    collection(users, userId, 'reactions'),
    where('type', '==', 'like'),
    where('contentType', '==', contentType)
  )
  return listenForValues<Reaction>(likes, (docs) => setLikes(docs))
}
