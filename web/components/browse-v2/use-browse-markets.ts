import { useEvent } from 'client-common/hooks/use-event'
import { APIParams } from 'common/api/schema'
import { Contract } from 'common/contract'
import { uniqBy } from 'lodash'
import { useEffect, useRef, useState } from 'react'

import { api } from 'web/lib/api/api'

export type BrowseMarketsQuery = Omit<
  APIParams<'search-markets-full'>,
  'offset' | 'limit'
>

type State = {
  key?: string
  contracts: Contract[]
  // Rows the server has returned so far, before de-duplication.
  offset: number
  hasMore: boolean
  loading: boolean
  error?: string
}

// Offset-paged market search. A new query replaces the list; responses to an
// older query are dropped so fast lens/topic switches can't interleave.
export function useBrowseMarkets(
  query: BrowseMarketsQuery | undefined,
  pageSize: number,
  // Changing this refetches the same query (e.g. after following a topic).
  refreshKey: string | number = 0
) {
  const key = query ? `${JSON.stringify(query)}|${refreshKey}` : undefined
  const [state, setState] = useState<State>({
    contracts: [],
    offset: 0,
    hasMore: true,
    loading: false,
  })
  const requestRef = useRef(0)

  const fetchPage = useEvent(async (fresh: boolean) => {
    if (!query || !key) return false
    const requestId = ++requestRef.current
    const last = state.contracts[state.contracts.length - 1]
    // New uses a time cursor, as the classic page does: offsets shift as
    // markets are created while the page is open.
    const useCursor = !fresh && query.sort === 'newest' && !!last
    const offset = fresh || useCursor ? 0 : state.offset
    setState((s) =>
      fresh
        ? { key, contracts: [], offset: 0, hasMore: true, loading: true }
        : { ...s, loading: true, error: undefined }
    )
    try {
      const page = await api('search-markets-full', {
        ...query,
        offset,
        ...(useCursor ? { beforeTime: last.createdTime } : {}),
        limit: pageSize,
      })
      if (requestId !== requestRef.current) return false
      const previous = fresh ? [] : state.contracts
      const contracts = uniqBy([...previous, ...page], 'id')
      // A full page that adds nothing new would repeat forever; stop.
      const hasMore =
        page.length >= pageSize && contracts.length > previous.length
      setState({
        key,
        contracts,
        offset: offset + page.length,
        hasMore,
        loading: false,
      })
      return hasMore
    } catch (error) {
      if (requestId !== requestRef.current) return false
      setState((s) => ({
        ...s,
        loading: false,
        hasMore: false,
        error: error instanceof Error ? error.message : String(error),
      }))
      return false
    }
  })

  useEffect(() => {
    if (key) fetchPage(true)
  }, [key])

  const loadMore = useEvent(async () => {
    if (state.loading || !state.hasMore || state.key !== key) return false
    return fetchPage(false)
  })

  const current = state.key === key
  const firstPageLoading =
    !current || (state.loading && state.contracts.length === 0)
  return {
    contracts: firstPageLoading ? undefined : state.contracts,
    loading: state.loading,
    hasMore: current && state.hasMore,
    error: current ? state.error : undefined,
    loadMore,
  }
}
