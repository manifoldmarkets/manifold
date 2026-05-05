import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import {
  selectSweepstakesWinners as selectSweepstakesWinnersInternal,
  SweepstakesError,
} from 'shared/sweepstakes'

export const selectSweepstakesWinners: APIHandler<
  'select-sweepstakes-winners'
> = async (props, auth) => {
  // Admin-only check
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can select sweepstakes winners')
  }

  const { sweepstakesNum } = props
  const pg = createSupabaseDirectClient()

  try {
    return await selectSweepstakesWinnersInternal(pg, sweepstakesNum)
  } catch (err) {
    if (err instanceof SweepstakesError) {
      throw new APIError(err.status, err.message)
    }
    throw err
  }
}
