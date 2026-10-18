// How often the sports resolver asks The Odds API for scores, set on
// /admin/sports, and the credits it has spent.

import { uniq } from 'lodash'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  getScorePollingRows,
  setScorePolling,
} from 'shared/supabase/sports-score-polling'
import { getOddsApiUsageSummary } from 'shared/supabase/odds-api-usage'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { SPORTS_CALENDAR } from 'common/sports-calendar'
import {
  DEFAULT_FINALS_INTERVAL,
  DEFAULT_LIVE_INTERVAL,
  parsePollingRows,
  pollingSettingError,
  sportForLeague,
} from 'common/sports-score-polling'

export const adminSportsScorePolling: APIHandler<
  'admin-sports-score-polling'
> = async (_props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()
  const [rows, usage, games] = await Promise.all([
    getScorePollingRows(pg),
    getOddsApiUsageSummary(pg),
    // Games on now or starting in the next 12 hours. A game closes at most
    // 4 hours after kickoff, which bounds close_time for the index.
    pg.map(
      `select id, data->>'question' as question, data->>'slug' as slug,
              data->>'sportsLeague' as league,
              data->>'sportsStartTimestamp' as start
         from contracts
        where creator_id = any($1)
          and resolution is null
          and data->>'sportsEventId' like 'odds:%'
          and close_time > now() - interval '6 hours'
          and close_time < now() + interval '16 hours'
          and (data->>'sportsStartTimestamp')::timestamptz
                < now() + interval '12 hours'
        order by start
        limit 100`,
      [MANIFOLD_SPORTS_USER_IDS],
      (r) => ({
        contractId: r.id as string,
        question: r.question as string,
        slug: r.slug as string,
        sport: sportForLeague(r.league ?? undefined),
        startTime: Date.parse(r.start),
      })
    ),
  ])
  const settings = parsePollingRows(rows)
  const sports = uniq(
    SPORTS_CALENDAR.filter((e) => e.oddsKey).map((e) => e.sport)
  )
  return {
    sports: sports.map((sport) => ({
      sport,
      intervalSeconds: settings.sports[sport] ?? DEFAULT_LIVE_INTERVAL,
      isDefault: settings.sports[sport] === undefined,
    })),
    finals: {
      intervalSeconds: settings.finals,
      isDefault: settings.finals === DEFAULT_FINALS_INTERVAL,
    },
    games: games.map((g) => ({
      ...g,
      overrideSeconds: settings.games[g.contractId] ?? null,
    })),
    usage,
  }
}

export const adminSportsSetScorePolling: APIHandler<
  'admin-sports-set-score-polling'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const { target, intervalSeconds } = props
  const error = pollingSettingError(target, intervalSeconds)
  if (error) throw new APIError(400, error)
  const pg = createSupabaseDirectClient()
  await setScorePolling(pg, { target, intervalSeconds, userId: auth.uid })
  log(
    `[sports] ${auth.uid} set ${target} polling to ${
      intervalSeconds === null ? 'the default' : `${intervalSeconds}s`
    }`
  )
  return { intervalSeconds }
}
