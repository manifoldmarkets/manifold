import {
  SportInfo,
  sportPath,
  SportsSubtopic,
  sportTopicPath,
} from 'common/sports-schedule'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

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
 * Whether built boards are overdue. The job rebuilds them hourly at :33 and a
 * run takes minutes, so boards over 90 minutes old mean a run failed or was
 * skipped.
 */
export function isDelayed(updatedTime: number, now: number): boolean {
  return now - updatedTime > 90 * MINUTE_MS
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

/** A leaderboard to go down to from a breadcrumb's last arrow. */
export interface BoardScopeChild {
  key: string
  label: string
  emoji?: string
  /** Its page's Leaderboards tab. */
  href: string
}

/**
 * What's under a leaderboard's scope, for the arrow after its breadcrumb:
 * - under All sports, every sport, then the topics that group sports;
 * - under a sport, its topics;
 * - under a topic, the sports whose main topic is inside it (Basketball holds
 *   the NBA), then the topics inside it filed under the same sport.
 */
export function boardScopeChildren(
  sport: Pick<SportInfo, 'key'> | 'all',
  topic: Pick<SportsSubtopic, 'id' | 'sport' | 'groupIds'> | undefined,
  index: {
    sports: readonly SportInfo[]
    topics: readonly SportsSubtopic[]
  }
): BoardScopeChild[] {
  const tab = '?tab=leaderboards'
  const ofSport = (s: SportInfo): BoardScopeChild => ({
    key: `sport-${s.key}`,
    label: s.label,
    emoji: s.emoji,
    href: sportPath(s.key) + tab,
  })
  const ofTopic = (t: SportsSubtopic): BoardScopeChild => ({
    key: `topic-${t.id}`,
    label: t.label,
    emoji: t.emoji,
    href: sportTopicPath(t.sport, t.slug) + tab,
  })
  const sports = index.sports.filter(
    (s) => s.key !== 'other' && s.groupIds.length > 0
  )
  if (!topic) {
    const key = sport === 'all' ? 'all' : sport.key
    return [
      ...(sport === 'all' ? sports.map(ofSport) : []),
      ...index.topics.filter((t) => t.sport === key).map(ofTopic),
    ]
  }
  const inside = new Set(topic.groupIds.filter((id) => id !== topic.id))
  const subtopicIds = new Set(index.topics.map((t) => t.id))
  // A sport's main topic is its first topic that isn't another one's.
  const mainId = (s: SportInfo) => s.groupIds.find((id) => !subtopicIds.has(id))
  return [
    ...sports
      .filter((s) => {
        const id = mainId(s)
        return id !== undefined && inside.has(id)
      })
      .map(ofSport),
    ...index.topics
      .filter((t) => inside.has(t.id) && t.sport === topic.sport)
      .map(ofTopic),
  ]
}
