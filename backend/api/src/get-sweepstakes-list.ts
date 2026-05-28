import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'
import { SweepstakesPrize, getTotalPrizePool } from 'common/sweepstakes'

export const getSweepstakesList: APIHandler<
  'get-sweepstakes-list'
> = async () => {
  const pg = createSupabaseDirectClient()

  const sweepstakes = await pg.manyOrNone<{
    sweepstakes_num: number
    name: string
    prizes: SweepstakesPrize[]
    close_time: string
    created_time: string
    winning_ticket_ids: string[] | null
  }>(
    `SELECT sweepstakes_num, name, prizes, close_time, created_time, winning_ticket_ids
     FROM sweepstakes
     ORDER BY sweepstakes_num DESC`
  )

  return {
    sweepstakes: sweepstakes.map((s) => ({
      sweepstakesNum: s.sweepstakes_num,
      name: s.name,
      closeTime: tsToMillis(s.close_time),
      createdTime: tsToMillis(s.created_time),
      hasWinners: !!(s.winning_ticket_ids && s.winning_ticket_ids.length > 0),
      // Total prize pool across all ranks — used by the past-drawings dropdown
      // to highlight big drawings (e.g. gold styling for $10k+).
      totalPrizeUsd: getTotalPrizePool(s.prizes),
    })),
  }
}
