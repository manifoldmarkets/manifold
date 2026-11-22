import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  nbaPlayoffSeason,
  projectNbaPlayoffSeries,
} from 'common/bdl/nba-playoff-series'
import { createBdlClient, type BdlClientOptions } from '../balldontlie-client'
import { isProd } from '../utils'

/** The caller supplies the current season's phase switch. No job is registered.
 * The season selector includes regular games and play-ins; postseason must be explicit per row.
 */
export async function readNbaPlayoffSeason(
  season: number,
  phaseEnabled: (season: number) => Promise<boolean>,
  options: Pick<BdlClientOptions, 'clock' | 'transport' | 'key'> & {
    role?: 'scheduler' | 'api' | 'dev'
  } = {}
) {
  if (!nbaPlayoffSeason(season)) throw Error('Unsupported NBA playoff season')
  const allowed = async () =>
    isSportsBdlEnabled() &&
    process.env.SPORTS_BDL_NBA_PLAYOFF_SERIES === 'true' &&
    (await phaseEnabled(season))
  if (!(await allowed())) return null
  const client = createBdlClient({
    ...options,
    key: options.key ?? process.env.BALLDONTLIE_API_KEY,
    role: isProd() ? options.role ?? 'scheduler' : 'dev',
    enabledLeagues: new Set(['nba']),
    isLeagueEnabled: allowed,
  })
  const games = await client.getAll<unknown>(
    '/nba/v1/games',
    { 'seasons[]': [season] },
    {
      maxPages: 20,
      matches: (r) =>
        typeof r === 'object' &&
        r !== null &&
        'season' in r &&
        r.season === season,
    }
  )
  if (!(await allowed())) return null
  return projectNbaPlayoffSeries(season, games, true)
}
