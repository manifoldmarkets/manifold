import { useEffect, useState } from 'react'
import { Comment, listenForComments } from '../lib/firebase/comments'

export const useComments = (contractId: string) => {
  const [comments, setComments] = useState<Comment[] | 'loading'>('loading')

  useEffect(() => {
    if (contractId) return listenForComments(contractId, setComments)
  }, [contractId])

  return comments
}
