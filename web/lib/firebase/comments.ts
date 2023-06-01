import { collection, limit, orderBy, query } from 'firebase/firestore'
import { Comment, ContractComment } from 'common/comment'
import { db } from './init'
import { getValues, listenForValues } from './utils'

export type { Comment }

export const MAX_COMMENT_LENGTH = 10000

function getCommentsCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'comments')
}

export async function listAllComments(
  contractId: string,
  maxCount: number | undefined = undefined
) {
  const q = query(
    getCommentsCollection(contractId),
    orderBy('createdTime', 'desc')
  )
  const limitedQ = maxCount ? query(q, limit(maxCount)) : q
  return await getValues<ContractComment>(limitedQ)
}

export function listenForCommentsOnContract(
  contractId: string,
  setComments: (comments: ContractComment[]) => void
) {
  return listenForValues<ContractComment>(
    query(getCommentsCollection(contractId), orderBy('createdTime', 'desc')),
    setComments
  )
}
