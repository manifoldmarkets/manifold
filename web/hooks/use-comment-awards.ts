import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'

export function useCommentAwards(contractId: string, commentIds: string[]) {
  const [awardsByComment, setAwardsByComment] = useState<
    Record<
      string,
      { plus: number; premium: number; crystal: number; awardedByMe?: boolean }
    >
  >({})
  useEffect(() => {
    if (!contractId || commentIds.length === 0) return
    let cancelled = false
    api('get-comment-awards', { contractId, commentIds }).then((res) => {
      if (!cancelled) setAwardsByComment(res.awardsByComment || {})
    })
    return () => {
      cancelled = true
    }
  }, [contractId, JSON.stringify(commentIds)])
  return awardsByComment
}

