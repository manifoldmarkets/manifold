import { useState } from 'react'
import { NextRouter, useRouter } from 'next/router'

export type Sort =
  | 'newest'
  | 'oldest'
  | 'most-traded'
  | '24-hour-vol'
  | 'close-date'
  | 'resolve-date'
  | 'last-updated'
  | 'score'

type UpdatedQueryParams = { [k: string]: string }

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

export function useQuery(defaultQuery: string, useUrl: boolean) {
  const router = useRouter()
  const initialQuery = useUrl ? getStringURLParam(router, 'q') : null
  const [query, setQuery] = useState(initialQuery ?? defaultQuery)
  if (!useUrl) {
    return [query, setQuery] as const
  } else {
    return [query, (q: string) => (setQuery(q), updateURL({ q }))] as const
  }
}

export function useSort(defaultSort: Sort, useUrl: boolean) {
  const router = useRouter()
  const initialSort = useUrl ? (getStringURLParam(router, 's') as Sort) : null
  const [sort, setSort] = useState(initialSort ?? defaultSort)
  if (!useUrl) {
    return [sort, setSort] as const
  } else {
    return [sort, (s: Sort) => (setSort(s), updateURL({ s }))] as const
  }
}
