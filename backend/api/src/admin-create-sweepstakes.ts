import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { SweepstakesPrize } from 'common/sweepstakes'

export const adminCreateSweepstakes: APIHandler<
  'admin-create-sweepstakes'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { closeTime, prizes } = body
  const pg = createSupabaseDirectClient()

  if (!prizes.length) {
    throw new APIError(400, 'At least one prize is required')
  }

  if (closeTime <= Date.now()) {
    throw new APIError(400, 'Close time must be in the future')
  }

  const active = await pg.oneOrNone<{
    sweepstakes_num: number
  }>(
    `SELECT sweepstakes_num
     FROM sweepstakes
     WHERE close_time > NOW()
     ORDER BY close_time DESC
     LIMIT 1`
  )

  if (active) {
    throw new APIError(400, 'An active drawing already exists')
  }

  const nextNum = await pg.oneOrNone<{ next_num: number }>(
    `SELECT COALESCE(MAX(sweepstakes_num), 0) + 1 AS next_num FROM sweepstakes`
  )

  const sweepstakesNum = nextNum?.next_num ?? 1
  const name = `Prize Drawing #${sweepstakesNum}`

  // Normalize prizes to ensure ranks are sequential and labels are valid
  const normalizedPrizes: SweepstakesPrize[] = prizes.map((p, index) => ({
    rank: p.rank ?? index + 1,
    amountUsdc: p.amountUsdc,
    label: p.label || `${index + 1}${getOrdinalSuffix(index + 1)}`,
  }))

  await pg.none(
    `INSERT INTO sweepstakes (sweepstakes_num, name, prizes, close_time)
     VALUES ($1, $2, $3::jsonb, to_timestamp($4 / 1000.0))`,
    [sweepstakesNum, name, JSON.stringify(normalizedPrizes), closeTime]
  )

  return { sweepstakesNum }
}

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}
