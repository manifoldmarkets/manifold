import {
  AnySportKey,
  sportForMarket,
  SportsIndex,
} from 'common/sports-schedule'

// Leaderboards for the sports pages. A full pass over every sports market's
// positions takes too long to run per request, so the scheduler rebuilds them
// (backend/shared/src/supabase/sports-leaderboards.ts) and the API serves the
// stored boards.

export const SPORTS_LEADERBOARD_KINDS = ['profit', 'creator'] as const
export type SportsLeaderboardKind = (typeof SPORTS_LEADERBOARD_KINDS)[number]

/** Entries kept per sport and kind. */
export const SPORTS_LEADERBOARD_SIZE = 50

export interface SportsLeaderboardEntry {
  userId: string
  /** Profit in mana, or for creators the traders on their markets. */
  score: number
}

export type SportsLeaderboards = Record<
  SportsLeaderboardKind,
  SportsLeaderboardEntry[]
> & {
  /** When the boards were last rebuilt; null before the first run. */
  updatedTime: number | null
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
