import { useEffect } from 'react'
import { ContractComment } from 'common/comment'
import { listenForCommentsOnContract } from 'web/lib/firebase/comments'
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
