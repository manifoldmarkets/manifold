// How often the sports resolver asks The Odds API for scores, set on
// /admin/sports, and the credits it has spent.

import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { uniq } from 'lodash'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  getScorePollingRows,
  getLegacyScorePollingGames,
  getScorePollingGames,
  setScorePolling,
} from 'shared/supabase/sports-score-polling'
import { getOddsApiUsageSummary } from 'shared/supabase/odds-api-usage'
import { BDL_LEAGUE_KEYS } from 'common/bdl/leagues'
import { getSportsCalendar } from 'common/sports-calendar'
import {
  DEFAULT_FINALS_INTERVAL,
  DEFAULT_LIVE_INTERVAL,
  parsePollingRows,
  pollingSettingError,
  bdlLiveInterval,
} from 'common/sports-score-polling'

export const adminSportsScorePolling: APIHandler<
  'admin-sports-score-polling'
> = async (_props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const pg = createSupabaseDirectClient()
  const [rows, usage, games] = await Promise.all([
    getScorePollingRows(pg),
    getOddsApiUsageSummary(pg),
    isSportsBdlEnabled()
      ? getScorePollingGames(pg)
      : getLegacyScorePollingGames(pg),
  ])
  const settings = parsePollingRows(rows)
  const sports = uniq(
    getSportsCalendar()
      .filter((e) => e.oddsKey)
      .map((e) => e.sport)
  )
  return {
    ...(isSportsBdlEnabled() && {
      leagues: BDL_LEAGUE_KEYS.map((leagueKey) => ({
        leagueKey,
        intervalSeconds: bdlLiveInterval(leagueKey, null, settings),
        isDefault: settings.leagues?.[leagueKey] === undefined,
      })),
    }),
    adaptive: settings.adaptive ?? false,
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
  if (!isSportsBdlEnabled() && target.startsWith('league:'))
    throw new APIError(400, `Unknown setting ${target}`)
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
