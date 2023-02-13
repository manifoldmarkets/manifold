import { useEffect, useState } from 'react'
import {
  Comment,
  ContractComment,
  GroupComment,
  PostComment,
} from 'common/comment'
import {
  listenForCommentsOnContract,
  listenForCommentsOnGroup,
  listenForCommentsOnPost,
  listenForLiveComments,
  listenForRecentComments,
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
export const useCommentsOnGroup = (groupId: string | undefined) => {
  const [comments, setComments] = useState<GroupComment[] | undefined>()

  useEffect(() => {
    if (groupId) return listenForCommentsOnGroup(groupId, setComments)
  }, [groupId])

  return comments
}

export const useCommentsOnPost = (postId: string | undefined) => {
  const [comments, setComments] = useState<PostComment[] | undefined>()

  useEffect(() => {
    if (postId) return listenForCommentsOnPost(postId, setComments)
  }, [postId])

  return comments
}

export const useRecentComments = () => {
  const [recentComments, setRecentComments] = useState<Comment[] | undefined>()
  useEffect(() => listenForRecentComments(setRecentComments), [])
  return recentComments
}

export const useLiveComments = (count: number) => {
  const [comments, setComments] = usePersistentState<Comment[] | undefined>(
    undefined,
    {
      store: inMemoryStore(),
      key: `liveComments-${count}`,
    }
  )

  useEffect(() => {
    return listenForLiveComments(count, setComments)
  }, [count, setComments])

  return comments
}
