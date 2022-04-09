import { useEffect, useState } from 'react'
import {
  Comment,
  getRecentComments,
  listenForComments,
  listenForRecentComments,
} from '../lib/firebase/comments'

export const useComments = (contractId: string) => {
  const [comments, setComments] = useState<Comment[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForComments(contractId, setComments)
  }, [contractId])

  return comments
}

export const useRecentComments = () => {
  const [recentComments, setRecentComments] = useState<Comment[] | undefined>()
  useEffect(() => listenForRecentComments(setRecentComments), [])
  return recentComments
}

export const useGetRecentComments = () => {
  const [recentComments, setRecentComments] = useState<Comment[] | undefined>()
  useEffect(() => {
    getRecentComments().then(setRecentComments)
  }, [])
  return recentComments
}
