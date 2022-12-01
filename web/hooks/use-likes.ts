import { useEffect, useState } from 'react'
import { Contract } from 'common/contract'
import { getContractFromId } from 'web/lib/firebase/contracts'
import { filterDefined } from 'common/util/array'
import { collection, query, where } from 'firebase/firestore'
import { users } from 'web/lib/firebase/users'
import { listenForValues } from 'web/lib/firebase/utils'
import { Reaction, ReactionContentTypes } from 'common/reaction'

export const useUserLikes = (
  userId: string | undefined,
  contentType: ReactionContentTypes
) => {
  const [reactionIds, setReactionIds] = useState<Reaction[] | undefined>()

  useEffect(() => {
    if (userId) return listenForLikes(userId, contentType, setReactionIds)
  }, [userId])

  return reactionIds
}
export const useUserLikedContracts = (userId: string | undefined) => {
  const [likes, setLikes] = useState<Reaction[] | undefined>()
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    if (userId)
      return listenForLikes(userId, 'contract', (likes) => {
        setLikes(likes)
      })
  }, [userId])

  useEffect(() => {
    if (likes)
      Promise.all(
        likes.map(async (like) => {
          return await getContractFromId(like.id)
        })
      ).then((contracts) => setContracts(filterDefined(contracts)))
  }, [likes])

  return contracts
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
