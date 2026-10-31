import { useEvent } from 'client-common/hooks/use-event'
import { uniqBy } from 'lodash'
import { useEffect, useRef, useState } from 'react'

// Each result category loads independently. A slow or failed request must
// neither hide the other categories nor replace results for a newer term.
export function useSearchResults<T extends { id: string }>(
  term: string,
  pageSize: number,
  fetchPage: (term: string, offset: number, signal: AbortSignal) => Promise<T[]>
) {
  const [state, setState] = useState<{
    term?: string
    items: T[]
    offset: number
    hasMore: boolean
    loading: boolean
    error: boolean
  }>({ items: [], offset: 0, hasMore: true, loading: true, error: false })
  const pending = useRef<AbortController>()

  const load = useEvent(async (fresh: boolean) => {
    if (!fresh && pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const offset = fresh ? 0 : state.offset
    const previous = fresh ? [] : state.items
    setState({
      term,
      items: previous,
      offset,
      hasMore: true,
      loading: true,
      error: false,
    })
    try {
      const page = await fetchPage(term, offset, controller.signal)
      if (controller.signal.aborted) return
      const items = uniqBy([...previous, ...page], 'id')
      setState({
        term,
        items,
        offset: offset + page.length,
        hasMore: page.length >= pageSize && items.length > previous.length,
        loading: false,
        error: false,
      })
    } catch {
      if (!controller.signal.aborted)
        setState((s) => ({ ...s, loading: false, error: true }))
    } finally {
      if (pending.current === controller) pending.current = undefined
    }
  })

  useEffect(() => {
    load(true)
    return () => pending.current?.abort()
  }, [term])

  const current = state.term === term
  return {
    items: current ? state.items : [],
    loading: !current || state.loading,
    error: current && state.error,
    hasMore: current && state.hasMore,
    loadMore: () => load(false),
  }
}
