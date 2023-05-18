import { useEffect, useState } from 'react'
import { ContractComment, PostComment } from 'common/comment'
import {
  listenForCommentsOnContract,
  listenForCommentsOnPost,
} from 'web/lib/firebase/comments'
import { usePersistentState, inMemoryStore } from './use-persistent-state'

export const useComments = (contractId: string) => {
  const [comments, setComments] = usePersistentState<
    ContractComment[] | undefined
  >(undefined, {
    key: 'comments-' + contractId,
    store: inMemoryStore(),
  })

  useEffect(() => {
    if (contractId) return listenForCommentsOnContract(contractId, setComments)
  }, [contractId])

  return comments
}
export const useCommentsOnPost = (postId: string | undefined) => {
  const [comments, setComments] = useState<PostComment[] | undefined>()

  useEffect(() => {
    if (postId) return listenForCommentsOnPost(postId, setComments)
  }, [postId])

  return comments
}
