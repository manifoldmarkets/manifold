import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { log } from 'shared/utils'

// Lets an admin remove a prize claim row outright — used to recover from
// e.g. an accidental 'opted_out' marking. After deletion the user is back
// in the "no claim" state and can submit a wallet again via the normal
// /prize flow. Existing terminal rows (sent/rejected) can also be removed
// this way if the admin determines the row was created in error.
export const adminDeletePrizeClaim: APIHandler<
  'admin-delete-prize-claim'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { claimId } = body
  const pg = createSupabaseDirectClient()

  const result = await pg.oneOrNone(
    `DELETE FROM sweepstakes_prize_claims WHERE id = $1 RETURNING id`,
    [claimId]
  )
  if (!result) throw new APIError(404, 'Prize claim not found')

  log(`Admin ${auth.uid} deleted prize claim ${claimId}`)
  return { success: true }
}
