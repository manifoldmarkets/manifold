import { MaybeAuthedContractParams } from 'common/contract'
import { getContractFromSlug } from 'common/supabase/contracts'
import { createSupabaseClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, MaybeAuthedEndpoint, validate } from './helpers/endpoint'

import { getContractParams } from 'common/contract-params'

const bodySchema = z
  .object({
    contractSlug: z.string(),
  })
  .strict()

export const getcontractparams = MaybeAuthedEndpoint<MaybeAuthedContractParams>(
  async (req, auth) => {
    const { contractSlug } = validate(bodySchema, req.body)
    const db = createSupabaseClient()
    const contract = await getContractFromSlug(contractSlug, db)

    if (!contract) {
      throw new APIError(404, 'This contract does not exist')
    }

    return getContractParams(contract, db, true, auth?.uid)
  }
)
