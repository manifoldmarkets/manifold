import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'

export const getSweepstakesList: APIHandler<
  'get-sweepstakes-list'
> = async () => {
  const pg = createSupabaseDirectClient()

  const sweepstakes = await pg.manyOrNone<{
    sweepstakes_num: number
    name: string
    close_time: string
    created_time: string
    winning_ticket_ids: string[] | null
  }>(
    `SELECT sweepstakes_num, name, close_time, created_time, winning_ticket_ids
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
    })),
  }
}
