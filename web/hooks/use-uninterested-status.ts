import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'

import { api } from 'web/lib/api/api'

// This preference is mutable and account-specific. Read it afresh on each
// visit instead of reusing useAPIGetter's cached GET promise.
export function useUninterestedStatus(
  contractId: string,
  userId: string | undefined
) {
  const [status, setStatus] = useState<{
    contractId: string
    userId: string
    uninterested: boolean
  }>()
  const activeRequest = useRef<{
    contractId: string
    userId: string
    changed: boolean
  }>()

  useEffect(() => {
    setStatus(undefined)
    if (!userId) return
    const request = { contractId, userId, changed: false }
    activeRequest.current = request
    const controller = new AbortController()
    api(
      'market/:contractId/uninterested-status',
      { contractId },
      { cache: 'no-store', signal: controller.signal }
    )
      .then(({ uninterested }) => {
        if (activeRequest.current === request && !request.changed)
          setStatus({ contractId, userId, uninterested })
      })
      .catch((err) => {
        if (activeRequest.current === request && !request.changed)
          toast.error(err instanceof Error ? err.message : String(err))
      })
    return () => {
      activeRequest.current = undefined
      controller.abort()
    }
  }, [contractId, userId])

  const setUninterested = useCallback(
    (uninterested: boolean) => {
      const request = activeRequest.current
      // An older toast or mutation may finish after navigating or changing
      // accounts. It must not overwrite the current market's preference.
      if (request?.contractId !== contractId || request.userId !== userId)
        return
      request.changed = true
      setStatus({ contractId, userId: request.userId, uninterested })
    },
    [contractId, userId]
  )

  const uninterested =
    status?.contractId === contractId && status.userId === userId
      ? status.uninterested
      : undefined
  return { uninterested, setUninterested }
}
