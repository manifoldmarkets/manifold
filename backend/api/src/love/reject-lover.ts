import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'

import { manifoldLoveUserId } from 'common/love/constants'

const rejectLoverSchema = z.object({
  userId: z.string(),
})

export const rejectLover = authEndpoint(async (req, auth) => {
  const { userId } = validate(rejectLoverSchema, req.body)
  const yourUserId = auth.uid

  const pg = createSupabaseDirectClient()
  const loverContracts = await pg.map<Contract>(
    `select data from contracts
    where (data->>'loverUserId1' = $1
    and data->>'loverUserId2' = $2)
    or (data->>'loverUserId1' = $2
    and data->>'loverUserId2' = $1)`,
    [yourUserId, userId],
    (r) => r.data
  )

  if (loverContracts.length === 0)
    throw new APIError(404, 'No lover contract found')

  const contract = loverContracts[0]
  const manifoldLoveUser = await getUser(manifoldLoveUserId)
  if (!manifoldLoveUser) throw new APIError(404, 'Manifold Love user not found')

  const resolvedContract = await resolveMarketHelper(
    contract,
    manifoldLoveUser,
    manifoldLoveUser,
    {
      outcome: 'NO',
    }
  )

  return { status: 'success', contract: resolvedContract }
})
