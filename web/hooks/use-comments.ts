import { useEffect } from 'react'
import { collection, orderBy, query } from 'firebase/firestore'
import { ContractComment } from 'common/comment'
import { db } from 'web/lib/firebase/init'
import { listenForValues } from 'web/lib/firebase/utils'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

function getCommentsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'comments')
}

function listenForCommentsOnContract(
  contractId: string,
  setComments: (comments: ContractComment[]) => void
) {
  return listenForValues<ContractComment>(
    query(getCommentsCollection(contractId), orderBy('createdTime', 'desc')),
    setComments
  )
}

export const useComments = (contractId: string) => {
  const [comments, setComments] = usePersistentInMemoryState<
    ContractComment[] | undefined
  >(undefined, 'comments-' + contractId)

  useEffect(() => {
    if (contractId) return listenForCommentsOnContract(contractId, setComments)
  }, [contractId])

  return comments
}
