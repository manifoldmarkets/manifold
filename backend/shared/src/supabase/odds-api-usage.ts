import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { OddsApiUsageSummary } from 'common/sports-score-polling'

// The Odds API reports on every response what the call cost and how many
// credits are used and left this billing period. Each call adds itself to a
// row per UTC day and sport key, so /admin/sports can show the spend by sport
// and how long the credits will last. No extra calls are made for this.

/** Adds one call to today's row. Never throws: a failed write only logs. */
export async function recordOddsApiUsage(sportKey: string, headers: Headers) {
  const int = (name: string) => {
    const value = parseInt(headers.get(name) ?? '')
    return Number.isFinite(value) ? value : null
  }
  try {
    await createSupabaseDirectClient().none(
      `insert into sports_odds_api_usage
         (day, sport_key, calls, credits, used_after, remaining_after)
       values ((now() at time zone 'utc')::date, $1, 1, $2, $3, $4)
       on conflict (day, sport_key) do update
         set calls = sports_odds_api_usage.calls + 1,
             credits = sports_odds_api_usage.credits + excluded.credits,
             used_after = coalesce(excluded.used_after, sports_odds_api_usage.used_after),
             remaining_after = coalesce(excluded.remaining_after, sports_odds_api_usage.remaining_after),
             updated_time = now()`,
      [
        sportKey,
        int('x-requests-last') ?? 0,
        int('x-requests-used'),
        int('x-requests-remaining'),
      ]
    )
  } catch (e) {
    log.warn(`[the-odds-api] couldn't record usage for ${sportKey}: ${e}`)
  }
}

export async function getOddsApiUsageSummary(
  pg: SupabaseDirectClient
): Promise<OddsApiUsageSummary> {
  const [latest, byDay, bySport] = await Promise.all([
    pg.oneOrNone(
      `select used_after, remaining_after, updated_time
         from sports_odds_api_usage
        where remaining_after is not null
        order by updated_time desc
        limit 1`
    ),
    pg.map(
      `select day::text as day, sum(credits)::int as credits
         from sports_odds_api_usage
        where day > (now() at time zone 'utc')::date - 14
        group by day
        order by day`,
      [],
      (r) => ({ day: r.day as string, credits: r.credits as number })
    ),
    pg.map(
      `select sport_key, sum(calls)::int as calls, sum(credits)::int as credits
         from sports_odds_api_usage
        where day > (now() at time zone 'utc')::date - 7
        group by sport_key
        order by credits desc`,
      [],
      (r) => ({
        sportKey: r.sport_key as string,
        calls: r.calls as number,
        credits: r.credits as number,
      })
    ),
  ])
  return {
    used: latest?.used_after ?? null,
    remaining: latest?.remaining_after ?? null,
    asOf: latest ? new Date(latest.updated_time).getTime() : null,
    byDay,
    bySport,
  }
}
