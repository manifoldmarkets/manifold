import { useEffect, useState } from 'react'
import { ContractComment } from 'common/comment'
import { api } from 'web/lib/api/api'

export function useSpecificComment(
  commentId: string | undefined,
  existingComments: ContractComment[]
) {
  const [specificComment, setSpecificComment] =
    useState<ContractComment | null>(null)
  const [loading, setLoading] = useState(false)

  // Check if the comment already exists in the loaded comments
  const commentExists = existingComments.some((c) => c.id === commentId)

  useEffect(() => {
    if (!commentId || commentExists) {
      setSpecificComment(null)
      setLoading(false)
      return
    }

    // Only fetch if we don't already have the comment and we have a commentId
    setLoading(true)
    api('get-comment', { commentId })
      .then((response) => {
        setSpecificComment(response.comment)
        setLoading(false)
      })
      .catch((error) => {
        console.error('Failed to fetch specific comment:', error)
        setSpecificComment(null)
        setLoading(false)
      })
  }, [commentId, commentExists])

  return {
    specificComment,
    loading,
    hasSpecificComment: !!specificComment,
  }
}
