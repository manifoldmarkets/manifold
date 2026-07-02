import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  createSweepstakes,
  SweepstakesError,
} from 'shared/sweepstakes'

export const adminCreateSweepstakes: APIHandler<
  'admin-create-sweepstakes'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)

  const { closeTime, prizes } = body
  const pg = createSupabaseDirectClient()

  try {
    return await createSweepstakes(pg, closeTime, prizes)
  } catch (err) {
    if (err instanceof SweepstakesError) {
      throw new APIError(err.status, err.message)
    }
    throw err
  }
}
