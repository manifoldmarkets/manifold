import { useEffect, useRef, useState } from 'react'
import { PerpOrder } from 'common/perps/orders'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { toast } from 'react-hot-toast'

// Server persistence, rather than component refs, recovers pending orders on
// refresh and across tabs. The same hook disables both trade and close panels.
export const usePerpOrder = (contractId: string, onFilled?: () => void) => {
  const user = useUser()
  const [order, setOrder] = useState<PerpOrder | null>(null)
  const current = useRef<PerpOrder | null>(null)
  const revision = useRef(0)
  const seen = useRef<string | null>(null)
  const onFilledRef = useRef(onFilled)
  onFilledRef.current = onFilled
  useEffect(() => {
    setOrder(null)
    current.current = null
    revision.current++
    seen.current = null
    if (!user) return
    let disposed = false
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      const startedRevision = revision.current
      try {
        const { order: next } = await api(
          'get-perp-order',
          { contractId },
          { cache: 'no-store' }
        )
        // A response started before submission must not clear the new pending
        // state. Nor may an older poll turn a completed order pending again.
        if (disposed || startedRevision !== revision.current) return
        const previous = current.current
        if (
          previous &&
          (!next ||
            next.createdTime < previous.createdTime ||
            (next.id === previous.id &&
              previous.status !== 'pending' &&
              next.status === 'pending'))
        )
          return
        current.current = next
        setOrder(next)
        if (next && next.status !== 'pending' && seen.current === next.id) {
          onFilledRef.current?.()
          if (next.status === 'filled')
            toast.success('Order filled at the next price', {
              id: 'perp-order-' + next.id,
            })
          else
            toast.error(next.error ?? 'Order did not execute', {
              id: 'perp-order-' + next.id,
            })
        }
        seen.current = next?.status === 'pending' ? next.id : null
      } catch {
        /* Poll again after transient network failure. */
      } finally {
        loading = false
      }
    }
    void load()
    const timer = setInterval(load, 2000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [contractId, user?.id])
  return {
    order,
    pending: order?.status === 'pending',
    // Optional: an API still on immediate execution answers without `order`.
    acceptOrder: (next: PerpOrder | undefined) => {
      if (!next) return
      revision.current++
      current.current = next
      seen.current = next.id
      setOrder(next)
    },
  }
}
