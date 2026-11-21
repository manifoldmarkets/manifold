import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { MAX_CHARITY_GIVEAWAY_PRIZE_DELTA_USD } from 'common/charity-giveaway'

export const adminUpdateCharityGiveawayPrize: APIHandler<
  'admin-update-charity-giveaway-prize'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { giveawayNum, prizeAmountUsd } = body
  const pg = createSupabaseDirectClient()

  const current = await pg.oneOrNone<{ prize_amount_usd: number }>(
    `SELECT prize_amount_usd FROM charity_giveaways WHERE giveaway_num = $1`,
    [giveawayNum]
  )

  if (!current) {
    throw new APIError(404, `Giveaway #${giveawayNum} not found`)
  }

  const currentAmount = Number(current.prize_amount_usd)
  const delta = Math.abs(prizeAmountUsd - currentAmount)
  if (delta > MAX_CHARITY_GIVEAWAY_PRIZE_DELTA_USD) {
    throw new APIError(
      400,
      `Single adjustment cannot exceed $${MAX_CHARITY_GIVEAWAY_PRIZE_DELTA_USD.toLocaleString()}. ` +
        `Current: $${currentAmount.toLocaleString()}, requested: $${prizeAmountUsd.toLocaleString()}.`
    )
  }

  const updated = await pg.one<{ prize_amount_usd: number }>(
    `UPDATE charity_giveaways
     SET prize_amount_usd = $1
     WHERE giveaway_num = $2
     RETURNING prize_amount_usd`,
    [prizeAmountUsd, giveawayNum]
  )

  return {
    giveawayNum,
    prizeAmountUsd: Number(updated.prize_amount_usd),
  }
}
