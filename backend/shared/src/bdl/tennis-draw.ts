import { BDL_LEAGUES } from 'common/bdl/leagues'
import { tennisDraw, type TennisTour } from 'common/bdl/tennis'
import type { createBdlClient } from '../balldontlie-client'
import { parseTennisMatch } from './tennis-matches'
import { z } from 'zod'

const scope = z.object({
  season: z.number().int(),
  tournament: z.object({ id: z.number().int(), season: z.number().int() }),
})
type Client = Pick<ReturnType<typeof createBdlClient>, 'getAll'>
/** A single scoped tournament draw, read only when its phase is enabled. WTA awaits Q13/P-T1. */
export async function readTennisDraw(
  client: Client,
  tour: TennisTour,
  tournamentId: number,
  season: number,
  enabled: () => boolean | Promise<boolean>,
  now = Date.now
) {
  if (tour === 'wta' || !(await enabled()))
    return { readStartedAt: null, rounds: [] }
  if (
    !Number.isSafeInteger(tournamentId) ||
    tournamentId <= 0 ||
    !Number.isInteger(season) ||
    season < 1000 ||
    season > 9999
  )
    throw Error('Invalid tennis tournament scope')
  // The oldest possible receipt in a paged batch bounds the freshness of every displayed row.
  const readStartedAt = now()
  const rows = await client.getAll<unknown>(
    BDL_LEAGUES[tour].apiBase + '/matches',
    { tournament_ids: [tournamentId], season },
    {
      maxPages: 6,
      matches: (raw) => {
        const parsed = scope.safeParse(raw)
        return (
          parsed.success &&
          parsed.data.season === season &&
          parsed.data.tournament.season === season &&
          parsed.data.tournament.id === tournamentId
        )
      },
    }
  )
  if (!(await enabled())) return { readStartedAt: null, rounds: [] }
  const matches = rows.flatMap((raw) => {
    const m = parseTennisMatch(tour, raw)
    return m ? [m] : []
  })
  return {
    readStartedAt,
    rounds: tennisDraw(matches, tour, tournamentId, season),
  }
}
