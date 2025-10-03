import { useEffect } from 'react'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export function useCommentAwards(contractId: string, commentIds: string[]) {
  const key = `comment-awards-${contractId}-${JSON.stringify(commentIds)}`
  const enabled = Boolean(contractId && commentIds.length > 0)
  const { data, refresh } = useAPIGetter(
    'get-comment-awards',
    enabled ? { contractId, commentIds } : (undefined as any),
    ['commentIds'],
    key,
    enabled
  )
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => refresh(), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [enabled, contractId])
  return (data as any)?.awardsByComment ?? {}
}
