import { HOUR_MS } from 'common/util/time'

export type BoardStatus = 'built' | 'notYet' | 'failed' | 'loading'

/**
 * What a sports leaderboard shows, given its request's state.
 * - built: the stored boards, even if a later refresh failed.
 * - notYet: the API answered, but there are no boards (the table is empty or
 *   missing).
 * - failed: the request failed and there are no boards to show.
 * - loading: no answer yet. That includes a mount's first render: an error
 *   cached from an earlier visit is still there until this mount's request
 *   clears it.
 */
export function boardStatus(
  data: { updatedTime: number | null } | undefined,
  error: unknown,
  mounted: boolean
): BoardStatus {
  if (data && data.updatedTime !== null) return 'built'
  if (!mounted) return 'loading'
  if (error) return 'failed'
  return data ? 'notYet' : 'loading'
}

/**
 * Whether to fetch the board again. It's asked when the board's timestamp
 * changes and at every ten-minute check (`tick` counts them): yes for a board
 * over an hour old or not built yet, and for a failed request at the next
 * check. A failure on mount needs nothing, since mounting fetches anyway.
 */
export function shouldRefresh(state: {
  updatedTime: number | null | undefined
  error: unknown
  loading: boolean
  tick: number
  now: number
}): boolean {
  const { updatedTime, error, loading, tick, now } = state
  if (loading) return false
  if (updatedTime === null) return true
  if (updatedTime !== undefined) return now - updatedTime > HOUR_MS
  return !!error && tick > 0
}
