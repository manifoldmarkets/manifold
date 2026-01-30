import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'

export const adminCreateCharityGiveaway: APIHandler<
  'admin-create-charity-giveaway'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { closeTime, prizeAmountUsd } = body
  const pg = createSupabaseDirectClient()

  if (prizeAmountUsd <= 0) {
    throw new APIError(400, 'Prize amount must be greater than 0')
  }

  if (closeTime <= Date.now()) {
    throw new APIError(400, 'Close time must be in the future')
  }

  const active = await pg.oneOrNone<{ giveaway_num: number }>(
    `SELECT giveaway_num
     FROM charity_giveaways
     WHERE close_time > NOW()
     ORDER BY close_time DESC
     LIMIT 1`
  )

  if (active) {
    throw new APIError(400, 'An active giveaway already exists')
  }

  const nextNum = await pg.oneOrNone<{ next_num: number }>(
    `SELECT COALESCE(MAX(giveaway_num), 0) + 1 AS next_num FROM charity_giveaways`
  )

  const giveawayNum = nextNum?.next_num ?? 1
  const name = `Charity Giveaway #${giveawayNum}`

  await pg.none(
    `INSERT INTO charity_giveaways (giveaway_num, name, prize_amount_usd, close_time)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
    [giveawayNum, name, prizeAmountUsd, closeTime]
  )

  return { giveawayNum }
}
