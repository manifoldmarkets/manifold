import { useEffect } from 'react'
import { collection, orderBy, query, where } from 'firebase/firestore'
import { ContractComment } from 'common/comment'
import { db } from 'web/lib/firebase/init'
import { listenForValues } from 'web/lib/firebase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

function getCommentsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'comments')
}

function listenForCommentsOnContract(
  contractId: string,
  setComments: (comments: ContractComment[]) => void,
  afterTime: number
) {
  return listenForValues<ContractComment>(
    query(
      getCommentsCollection(contractId),
      orderBy('createdTime', 'desc'),
      where('createdTime', '>', afterTime)
    ),
    setComments
  )
}

export const useComments = (contractId: string, afterTime: number) => {
  const [comments, setComments] = usePersistentInMemoryState<
    ContractComment[] | undefined
  >(undefined, 'comments-' + contractId)

  // TODO: first query supabase for older comments, then listen for new comments with firebase
  useEffect(() => {
    if (contractId)
      return listenForCommentsOnContract(contractId, setComments, afterTime)
  }, [contractId])

  return comments
}
