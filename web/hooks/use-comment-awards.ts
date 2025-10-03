import { useMemo } from 'react'
import { useBatchedGetter } from 'client-common/hooks/use-batched-getter'
import { api } from 'web/lib/api/api'

export function useCommentAwards(contractId: string, commentIds: string[]) {
  const enabled = Boolean(contractId && commentIds.length > 0)
  const id = commentIds.join(',')
  const tuple = useBatchedGetter(
    {
      'comment-awards': async ({ ids }) => {
        const allIds = Array.from(ids)
        const res = await api('get-comment-awards', {
          contractId,
          commentIds: allIds,
        })
        // Flatten to an array mapping for filter
        const arr = allIds.map((cid) => ({
          commentId: cid,
          ...(res.awardsByComment?.[cid] ?? {
            plus: 0,
            premium: 0,
            crystal: 0,
          }),
        }))
        return arr as any
      },
    },
    'comment-awards',
    id,
    {},
    enabled
  ) as unknown as [
    {
      commentId: string
      plus: number
      premium: number
      crystal: number
      awardedByMe?: boolean
    }
  ]
  const result = tuple?.[0]

  return useMemo(() => {
    const map: Record<string, any> = {}
    if (result && commentIds.includes(result.commentId)) {
      map[result.commentId] = result
    }
    return map
  }, [JSON.stringify(commentIds), result])
}
