import type { APIParams } from 'common/api/schema'
import {
  FullMarketSearchResult,
  MAX_MARKET_SEARCH_LIMIT,
  MAX_MARKET_SEARCH_OFFSET,
  parseSportsDiscoveryCursor,
  shouldExcludeOfficialSports,
} from 'common/api/market-search-types'
import type { Contract } from 'common/contract'
import { isOfficialSportsGameMarket } from 'common/sports-discovery'
import type { BaseApiCallOptions } from 'common/util/api'
import { api, APIError } from './api'

type Params = APIParams<'search-markets-full'> & { limit: number }
export type DiscoverySearchSession = {
  legacy?: boolean
  rawOffset?: number
  visibleOffset?: number
}

export function discoveryParams(
  params: Params,
  surface: Params['sportsDiscovery'],
  previous: readonly Contract[]
): Params {
  const scoped = { ...params, sportsDiscovery: surface }
  if (!shouldExcludeOfficialSports(scoped)) return params
  const last = previous[previous.length - 1]
  return params.sort === 'newest' && last
    ? {
        ...scoped,
        offset: 0,
        beforeTime: undefined,
        sportsDiscoveryCursor: `${last.createdTime}:${last.id}`,
      }
    : scoped
}

const isUnsupportedOption = (e: unknown) =>
  e instanceof APIError &&
  e.code === 400 &&
  e.message === 'Error validating request.' &&
  Array.isArray(e.details) &&
  e.details.some(
    (issue: { error?: unknown; field?: unknown } | null) =>
      typeof issue?.error === 'string' &&
      /unknown|unrecognized/i.test(issue.error) &&
      /\bsportsDiscovery(Cursor)?\b/.test(issue.error + ' ' + issue.field)
  )

const byNewest = (a: Contract, b: Contract) =>
  b.createdTime - a.createdTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export async function searchDiscoveryMarkets(
  params: Params,
  previous: readonly Contract[] = [],
  session: DiscoverySearchSession = {},
  options?: BaseApiCallOptions
): Promise<FullMarketSearchResult[]> {
  const { sportsDiscovery, sportsDiscoveryCursor, ...raw } = params
  const read = (p: APIParams<'search-markets-full'>) => {
    options?.signal?.throwIfAborted()
    return api('search-markets-full', p, options)
  }
  if (!shouldExcludeOfficialSports(params)) return read(raw)

  const newest = params.sort === 'newest'
  const seen = new Set(previous.map((c) => c.id))
  const cursor = sportsDiscoveryCursor
    ? parseSportsDiscoveryCursor(sportsDiscoveryCursor)
    : null
  if (!session.legacy) {
    try {
      const page = await read({
        ...raw,
        sportsDiscovery,
        sportsDiscoveryCursor,
      })
      if (page.length === 0) return []
      // A permissive old worker may return entirely ordinary rows in its own
      // equal-time order. Only a current response establishes a safe cursor.
      if (
        page[page.length - 1].sportsDiscoveryFiltered === true &&
        !page.some(isOfficialSportsGameMarket)
      )
        return page
    } catch (error) {
      if (!isUnsupportedOption(error)) throw error
    }
    session.legacy = true
  }

  const result: FullMarketSearchResult[] = []
  const append = (c: FullMarketSearchResult) => {
    if (!isOfficialSportsGameMarket(c) && !seen.has(c.id)) {
      seen.add(c.id)
      result.push(c)
    }
  }
  if (newest) {
    // The old time cursor is exclusive. Read the entire boundary millisecond
    // before comparing IDs, and defer a partial trailing tie to the next read.
    let beforeTime = cursor ? cursor.beforeTime + 1 : raw.beforeTime
    while (result.length < params.limit) {
      const page = await read({
        ...raw,
        beforeTime,
        offset: 0,
        limit: MAX_MARKET_SEARCH_LIMIT,
      })
      if (!page.length) break
      const ordered = [...page].sort(byNewest)
      const oldest = ordered[ordered.length - 1].createdTime
      const full = page.length === MAX_MARKET_SEARCH_LIMIT
      const allAtBoundary = ordered[0].createdTime === oldest
      const partial = full && !allAtBoundary
      if (full && allAtBoundary) {
        // Offset is ignored alongside beforeTime. An unanchored read can still
        // recover the part of this tie in raw positions 1,001 through 2,000.
        const more = await read({
          ...raw,
          beforeTime: undefined,
          offset: MAX_MARKET_SEARCH_OFFSET,
          limit: MAX_MARKET_SEARCH_LIMIT,
        })
        ordered.push(...more.filter((c) => c.createdTime === oldest))
        ordered.sort(byNewest)
      }
      for (const c of ordered) {
        if (partial && c.createdTime === oldest) break
        if (
          !cursor ||
          c.createdTime < cursor.beforeTime ||
          (c.createdTime === cursor.beforeTime &&
            (previous.length > 0 || c.id > cursor.beforeId))
        )
          append(c)
        if (result.length === params.limit) break
      }
      if (page.length < MAX_MARKET_SEARCH_LIMIT) break
      // The old endpoint ignores offset with beforeTime and has no ID cursor.
      // Equal-time rows beyond both available windows cannot be enumerated.
      const next = partial ? oldest + 1 : oldest
      if (
        !Number.isFinite(next) ||
        (beforeTime !== undefined && next >= beforeTime)
      )
        break
      beforeTime = next
    }
    return result
  }

  // A different worker may have paged previous results after exclusion. Once
  // raw paging is needed, reconcile those IDs once and keep the raw position.
  const offset = params.offset ?? 0
  let position = session.visibleOffset === offset ? session.rawOffset ?? 0 : 0
  let previousPage: { offset: number; ids: string[] } | undefined
  let batch = params.limit
  const maxPosition = MAX_MARKET_SEARCH_OFFSET + MAX_MARKET_SEARCH_LIMIT
  while (result.length < params.limit && position < maxPosition) {
    const requestOffset = Math.min(position, MAX_MARKET_SEARCH_OFFSET)
    const skip = position - requestOffset
    const limit = Math.min(skip + batch, MAX_MARKET_SEARCH_LIMIT)
    const page = await read({ ...raw, offset: requestOffset, limit })
    if (page.length <= skip) break
    const lastIds = previousPage?.ids
    if (
      lastIds &&
      previousPage?.offset !== requestOffset &&
      lastIds.length === page.length &&
      page.every((c, i) => c.id === lastIds[i])
    )
      break
    previousPage = { offset: requestOffset, ids: page.map((c) => c.id) }
    const collected = result.length
    for (const c of page.slice(skip)) {
      position++
      append(c)
      if (result.length === params.limit) break
    }
    if (page.length < limit) break
    if (collected === result.length)
      batch = Math.min(batch * 2, MAX_MARKET_SEARCH_LIMIT)
  }
  session.rawOffset = position
  session.visibleOffset = offset + result.length
  return result
}
