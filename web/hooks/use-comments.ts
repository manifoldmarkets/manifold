import { useEffect, useState } from 'react'
import {
  Comment,
  listenForCommentsOnContract,
  listenForRecentComments,
} from 'web/lib/firebase/comments'

export const useComments = (contractId: string) => {
  const [comments, setComments] = useState<Comment[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForCommentsOnContract(contractId, setComments)
  }, [contractId])

  return comments
}

export const useRecentComments = () => {
  const [recentComments, setRecentComments] = useState<Comment[] | undefined>()
  useEffect(() => listenForRecentComments(setRecentComments), [])
  return recentComments
}
