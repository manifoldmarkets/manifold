import { useState } from 'react'
import {
  usePersistentState,
  PersistenceOptions,
} from 'web/hooks/use-persistent-state'
import { NextRouter, useRouter } from 'next/router'

export const SORTS = [
  { label: 'Newest', value: 'newest' },
  { label: 'Trending', value: 'score' },
  { label: 'Most traded', value: 'most-traded' },
  { label: '24h volume', value: '24-hour-vol' },
  { label: 'Last updated', value: 'last-updated' },
  { label: 'Subsidy', value: 'liquidity' },
  { label: 'Close date', value: 'close-date' },
  { label: 'Resolve date', value: 'resolve-date' },
] as const

export type Sort = typeof SORTS[number]['value']

type UpdatedQueryParams = { [k: string]: string }
type QuerySortOpts = { useUrl: boolean; persist?: PersistenceOptions }

function withURLParams(location: Location, params: UpdatedQueryParams) {
  const newParams = new URLSearchParams(location.search)
  for (const [k, v] of Object.entries(params)) {
    if (!v) {
      newParams.delete(k)
    } else {
      newParams.set(k, v)
    }
  }
  const newUrl = new URL(location.href)
  newUrl.search = newParams.toString()
  return newUrl
}

function updateURL(params: UpdatedQueryParams) {
  // see relevant discussion here https://github.com/vercel/next.js/discussions/18072
  const url = withURLParams(window.location, params).toString()
  const updatedState = { ...window.history.state, as: url, url }
  window.history.replaceState(updatedState, '', url)
}

function getStringURLParam(router: NextRouter, k: string) {
  const v = router.query[k]
  return typeof v === 'string' ? v : null
}

export function useQuery(defaultQuery: string, opts?: QuerySortOpts) {
  const useUrl = opts?.useUrl ?? false
  const router = useRouter()
  const initialQuery = useUrl ? getStringURLParam(router, 'q') : null
  const [query, setQuery] = usePersistentState(
    initialQuery ?? defaultQuery,
    opts?.persist
  )
  if (!useUrl) {
    return [query, setQuery] as const
  } else {
    return [query, (q: string) => (setQuery(q), updateURL({ q }))] as const
  }
}

export function useSort(defaultSort: Sort, opts?: QuerySortOpts) {
  const useUrl = opts?.useUrl ?? false
  const router = useRouter()
  const initialSort = useUrl ? (getStringURLParam(router, 's') as Sort) : null
  const [sort, setSort] = usePersistentState(
    initialSort ?? defaultSort,
    opts?.persist
  )
  if (!useUrl) {
    return [sort, setSort] as const
  } else {
    return [sort, (s: Sort) => (setSort(s), updateURL({ s }))] as const
  }
}
