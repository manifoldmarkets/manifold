import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'
import { tsToMillis } from 'common/supabase/utils'

export const getCharityGiveawayList: APIHandler<
  'get-charity-giveaway-list'
> = async () => {
  const pg = createSupabaseDirectClient()

  const giveaways = await pg.manyOrNone<{
    giveaway_num: number
    name: string
    close_time: string
    created_time: string
    winning_ticket_id: string | null
  }>(
    `SELECT giveaway_num, name, close_time, created_time, winning_ticket_id
     FROM charity_giveaways
     ORDER BY giveaway_num DESC`
  )

  return {
    giveaways: giveaways.map((g) => ({
      giveawayNum: g.giveaway_num,
      name: g.name,
      closeTime: tsToMillis(g.close_time),
      createdTime: tsToMillis(g.created_time),
      hasWinner: !!g.winning_ticket_id,
    })),
  }
}
