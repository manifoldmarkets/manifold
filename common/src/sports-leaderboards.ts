import { uniq } from 'lodash'
import {
  AnySportKey,
  sportForMarket,
  SportsIndex,
} from 'common/sports-schedule'

// Leaderboards for the sports pages. A full pass over every sports market's
// positions takes too long to run per request, so the scheduler rebuilds them
// (backend/shared/src/supabase/sports-leaderboards.ts) and the API serves the
// stored boards: one per sport ('all' for every sport), and one per other
// topic under Sports (topicBoardKey).

export const SPORTS_LEADERBOARD_KINDS = ['profit', 'creator'] as const
export type SportsLeaderboardKind = (typeof SPORTS_LEADERBOARD_KINDS)[number]

/** Entries kept per sport and kind. */
export const SPORTS_LEADERBOARD_SIZE = 50

export interface SportsLeaderboardEntry {
  userId: string
  /** Profit in mana, or for creators the traders on their markets. */
  score: number
}

/** Where one user stands on a board. */
export interface SportsLeaderboardPosition {
  /** 1 is the top. Everyone with a score is ranked, losses included. */
  rank: number
  score: number
  /** How many are ranked on the board. */
  of: number
}

export type SportsLeaderboards = Record<
  SportsLeaderboardKind,
  SportsLeaderboardEntry[]
> & {
  /** When the boards were last rebuilt; null before the first run. */
  updatedTime: number | null
  /**
   * With a userId, that user's place on each kind: null where they have no
   * score (no positions, or no markets of their own).
   */
  you?: Record<SportsLeaderboardKind, SportsLeaderboardPosition | null>
}

/**
 * The sport whose boards a market counts toward, besides All: the one its
 * games and markets show under (see sportForMarket). Markets that sit under
 * Sports without a sport of their own count toward All only.
 */
export function leaderboardSportForMarket(
  market: { sportsLeague?: string | null; groupIds: readonly string[] },
  index: SportsIndex
): AnySportKey | undefined {
  const sport = sportForMarket(market, index)
  return sport === 'other' ? undefined : sport
}

/** Where a topic's boards are stored. Sport keys never hold a colon. */
export const topicBoardKey = (topicId: string) => `topic:${topicId}`

/** Topic id → the boards of the topics whose pages cover it. */
export function topicBoardsByGroupId(
  index: Pick<SportsIndex, 'topics'>
): Map<string, string[]> {
  const boards = new Map<string, string[]>()
  for (const t of index.topics) {
    for (const id of t.groupIds) {
      boards.set(id, [...(boards.get(id) ?? []), topicBoardKey(t.id)])
    }
  }
  return boards
}

/**
 * Every board a market counts toward: All, its sport's, and the board of
 * each other topic under Sports whose page covers it (the topic and the ones
 * under it), so a Premier League market counts toward Premier League, Soccer
 * and All.
 */
export function leaderboardBoardsForMarket(
  market: { sportsLeague?: string | null; groupIds: readonly string[] },
  index: SportsIndex,
  byGroupId = topicBoardsByGroupId(index)
): string[] {
  const sport = leaderboardSportForMarket(market, index)
  return uniq([
    'all',
    ...(sport ? [sport] : []),
    ...market.groupIds.flatMap((id) => byGroupId.get(id) ?? []),
  ])
}
