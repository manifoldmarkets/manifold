import {
  TournamentConfig,
  LiveMatchScore,
  fetchInPlayMatches,
  matchSportsEventId,
} from 'shared/sports-markets'
import { SupabaseDirectClient } from 'shared/supabase/init'

const ACTIVE_WINDOW_MS = 3 * 60 * 60 * 1000 // 3 hours

export async function isInActiveWindow(
  config: TournamentConfig,
  pg: SupabaseDirectClient
): Promise<boolean> {
  const now = Date.now()
  const windowStart = now - ACTIVE_WINDOW_MS
  const windowEnd = now + ACTIVE_WINDOW_MS

  const row = await pg.oneOrNone<{ count: string }>(
    `select count(*) as count from contracts
     where data->>'sportsLeague' = $1
       and token = 'MANA'
       and (data->>'closeTime')::bigint between $2 and $3`,
    [config.sportsLeague, windowStart, windowEnd]
  )
  return parseInt(row?.count ?? '0', 10) > 0
}

export async function pollLiveScoresIfActive(
  config: TournamentConfig,
  apiKey: string,
  pg: SupabaseDirectClient
): Promise<LiveMatchScore[] | null> {
  const active = await isInActiveWindow(config, pg)
  if (!active) return null

  const matches = await fetchInPlayMatches(config, apiKey)
  return matches.map((m) => ({
    sportsEventId: matchSportsEventId(m),
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    status: m.status,
  }))
}
