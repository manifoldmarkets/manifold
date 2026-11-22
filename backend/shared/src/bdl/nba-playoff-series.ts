import { z } from 'zod'
import { isSportsBdlEnabled } from 'common/bdl/rollout'
import {
  nbaPlayoffSeason,
  projectNbaPlayoffSeries,
} from 'common/bdl/nba-playoff-series'
import { createBdlClient, type BdlClientOptions } from '../balldontlie-client'
import { isProd } from '../utils'

const cursor = z.union([
  z.number().int().safe().positive(),
  z
    .string()
    .min(1)
    .refine((value) => value.trim() === value),
])
const seasonPage = z.object({
  data: z.array(z.unknown()).max(100),
  meta: z.object({
    per_page: z.literal(100),
    next_cursor: cursor.nullish(),
    prev_cursor: cursor.nullish(),
  }),
})
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
    onAttempt: ({ status, body, request }) => {
      if (status < 200 || status >= 300) return
      const parsed = seasonPage.safeParse(body)
      if (!parsed.success) throw Error('Invalid NBA season pagination envelope')
      // Each observed continuation echoed its requested cursor; the terminal page
      // retained this metadata while omitting next_cursor.
      const { meta } = parsed.data
      if (
        meta.prev_cursor != null &&
        String(meta.prev_cursor) !== String(request.params.cursor ?? '')
      )
        throw Error('NBA season page does not match its requested cursor')
    },
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
