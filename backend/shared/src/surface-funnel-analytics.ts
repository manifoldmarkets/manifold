import { type SupabaseTransaction } from 'shared/supabase/init'
import { ENV_CONFIG } from 'common/envs/constants'
import {
  STAT_SURFACES,
  STAT_SURFACE_DEFINITIONS,
  STAT_SURFACE_EVENT_KEY,
  SURFACE_TRADE_EVENT,
  computeSurfaceFunnels,
  getSurfaceVisitorIds,
} from 'common/stat-surfaces'

// One LA calendar day of the /stats page funnels: $1 is the day and $2 the
// next day, as YYYY-MM-DD. Reads about 220k user_events rows a day through
// the ts index (~7s on prod in 2026-10), so the stats job runs it per day.
export const getSurfaceFunnelsForDay = async (
  pg: SupabaseTransaction,
  day: string,
  next: string
) => {
  const { adminIds } = ENV_CONFIG
  const legacyViewEvents = STAT_SURFACES.flatMap(
    (s) => STAT_SURFACE_DEFINITIONS[s].legacyViewEvents
  )
  const legacyViewPatterns = STAT_SURFACES.flatMap((s) =>
    STAT_SURFACE_DEFINITIONS[s].legacyViewEventPrefixes.map((p) => p + '%')
  )

  const rows = await pg.map(
    `select
      user_id,
      extract(epoch from ts)::float8 * 1000 as ts_ms,
      name,
      data->>'topic' as topic,
      data->>$7 as funnel
    from user_events
    where
      ts >= date_to_midnight_pt($1)
      and ts < date_to_midnight_pt($2)
      and user_id is not null
      and user_id not in ($3:list)
      and (
        name in ('select search topic', $4)
        or (
          name like 'view %'
          and (
            data ? $7
            or name in ($5:list)
            or name like any ($6::text[])
          )
        )
      )`,
    [
      day,
      next,
      adminIds,
      SURFACE_TRADE_EVENT,
      legacyViewEvents,
      legacyViewPatterns,
      STAT_SURFACE_EVENT_KEY,
    ],
    (r) => ({
      userId: r.user_id as string,
      tsMs: r.ts_ms as number,
      name: r.name as string,
      topic: r.topic as string | null,
      funnel: r.funnel as string | null,
    })
  )

  const visitorIds = getSurfaceVisitorIds(rows)
  // Trades as submitted, matching the web client's trade events: market bets,
  // sells and limit orders (not API or redemption), and perp orders, which
  // cover opens, adds and closes whether or not they later filled.
  const tradedAnywhere =
    visitorIds.length === 0
      ? []
      : await pg.map(
          `select user_id from contract_bets
          where
            user_id in ($3:list)
            and created_time >= date_to_midnight_pt($1)
            and created_time < date_to_midnight_pt($2)
            and not is_api
            and not is_redemption
          union
          select user_id from perp_orders
          where
            user_id in ($3:list)
            and created_time >= date_to_midnight_pt($1)
            and created_time < date_to_midnight_pt($2)
            and not is_api`,
          [day, next, visitorIds],
          (r) => r.user_id as string
        )

  return computeSurfaceFunnels(rows, new Set(tradedAnywhere))
}
