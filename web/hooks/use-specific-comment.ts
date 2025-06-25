import { useMemo } from 'react'
import { ContractComment } from 'common/src/comment'
import { useCommentOnContract } from './use-comments'

export function useSpecificComment(
  commentId: string | undefined,
  existingComments: ContractComment[]
) {
  const specificComment = useCommentOnContract(commentId || '')
  
  const hasSpecificComment = useMemo(() => {
    return commentId 
      ? existingComments.some(comment => comment.id === commentId)
      : false
  }, [commentId, existingComments])

  const loading = commentId && !hasSpecificComment && specificComment === undefined

  return {
    specificComment: !hasSpecificComment ? specificComment : null,
    loading: !!loading,
    hasSpecificComment
  }
}
