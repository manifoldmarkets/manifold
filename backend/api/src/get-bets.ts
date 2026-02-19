import { APIError, type APIHandler } from './helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getContractIdFromSlug } from 'shared/supabase/contracts'
import { getUserIdFromUsername } from 'shared/supabase/users'
import { getBetsWithFilter } from 'shared/supabase/bets'
import { convertBet, NON_POINTS_BETS_LIMIT } from 'common/supabase/bets'
import { filterDefined } from 'common/util/array'
import { ValidatedAPIParams } from 'common/api/schema'

const POINTS_QUERY_CACHE_TTL_MS = 20_000
const MAX_POINTS_QUERY_CACHE_ENTRIES = 500

type CachedPointsResult = {
  result: Awaited<ReturnType<typeof getBetsWithFilter>>
  cachedAt: number
}

const cachedPointsQueries = new Map<string, CachedPointsResult>()

export const getBetsInternal = async (props: ValidatedAPIParams<'bets'>) => {
  const shouldUseCache = shouldCachePointsQuery(props)
  const cacheKey = shouldUseCache ? getPointsCacheKey(props) : undefined
  if (cacheKey) {
    const cached = cachedPointsQueries.get(cacheKey)
    if (
      cached &&
      Date.now() - cached.cachedAt <= POINTS_QUERY_CACHE_TTL_MS
    ) {
      return cached.result
    }
  }

  const {
    limit,
    username,
    contractSlug,
    answerId,
    before,
    after,
    beforeTime,
    afterTime,
    order,
    kinds,
    minAmount,
    filterRedemptions,
    includeZeroShareRedemptions,
    commentRepliesOnly,
    count,
    points,
    id,
  } = props
  if (limit === 0) {
    return []
  } else if (limit > NON_POINTS_BETS_LIMIT && !points) {
    throw new APIError(
      400,
      'Non-points limit must be less than or equal to ' + NON_POINTS_BETS_LIMIT
    )
  }
  const pg = createSupabaseDirectClient()
  if (id) {
    const bet = await pg.map(
      `select * from contract_bets where bet_id = $1`,
      [id],
      (r) => (r ? convertBet(r) : undefined)
    )
    return filterDefined(bet)
  }

  const userId = props.userId ?? (await getUserIdFromUsername(pg, username))
  const contractId =
    props.contractId ?? (await getContractIdFromSlug(pg, contractSlug))

  // mqp: this pagination approach is technically incorrect if multiple bets
  // have the exact same createdTime, but that's very unlikely
  const beforeBetTime =
    before === undefined
      ? undefined
      : await getBetTime(pg, before).catch(() => {
          throw new APIError(404, 'Bet specified in before parameter not found')
        })

  const afterBetTime = !after
    ? undefined
    : await getBetTime(pg, after).catch(() => {
        throw new APIError(404, 'Bet specified in after parameter not found')
      })

  const opts = {
    userId,
    contractId,
    answerId,
    beforeTime:
      beforeTime !== undefined && beforeBetTime !== undefined
        ? Math.min(beforeTime, beforeBetTime)
        : beforeTime ?? beforeBetTime,
    afterTime:
      afterTime && afterBetTime
        ? Math.max(afterTime, afterBetTime)
        : afterTime ?? afterBetTime,
    limit,
    order,
    kinds,
    minAmount,
    filterRedemptions,
    includeZeroShareRedemptions,
    count,
    points,
    commentRepliesOnly,
  }

  const result = await getBetsWithFilter(pg, opts)
  if (cacheKey) {
    cachedPointsQueries.set(cacheKey, {
      result,
      cachedAt: Date.now(),
    })
    trimPointsCache()
  }
  return result
}

export const getBets: APIHandler<'bets'> = async (props) =>
  getBetsInternal(props)

export const getBetPointsBetween: APIHandler<'bet-points'> = async (props) =>
  getBetsInternal({
    ...props,
    points: true,
  })

async function getBetTime(pg: SupabaseDirectClient, id: string) {
  const created = await pg.oneOrNone(
    `
  select ts_to_millis(created_time) as "createdTime" from postgres.public.contract_bets where bet_id = $1`,
    [id],
    (r) => r.createdTime
  )
  return created ?? undefined
}

const shouldCachePointsQuery = (props: ValidatedAPIParams<'bets'>) => {
  return (
    !!props.points &&
    !props.count &&
    !props.id &&
    !props.before &&
    !props.after
  )
}

const getPointsCacheKey = (props: ValidatedAPIParams<'bets'>) => {
  // Keep a single source of truth for cache key shape.
  return JSON.stringify({
    contractId: props.contractId,
    contractSlug: props.contractSlug,
    answerId: props.answerId,
    beforeTime: props.beforeTime,
    afterTime: props.afterTime,
    filterRedemptions: props.filterRedemptions,
    includeZeroShareRedemptions: props.includeZeroShareRedemptions,
    minAmount: props.minAmount,
    commentRepliesOnly: props.commentRepliesOnly,
    order: props.order,
    limit: props.limit,
    userId: props.userId,
    username: props.username,
    kinds: props.kinds,
  })
}

const trimPointsCache = () => {
  while (cachedPointsQueries.size > MAX_POINTS_QUERY_CACHE_ENTRIES) {
    const oldestKey = cachedPointsQueries.keys().next().value
    if (!oldestKey) return
    cachedPointsQueries.delete(oldestKey)
  }
}
