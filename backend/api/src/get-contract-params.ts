import { MaybeAuthedContractParams } from 'common/contract'
import { getContractFromSlug } from 'common/supabase/contracts'
import { createSupabaseClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, MaybeAuthedEndpoint, validate } from './helpers'

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

    if (contract.visibility === 'private') {
      if (!contract.groupLinks) {
        throw new APIError(
          500,
          'No associated group with this private contract'
        )
      }

      if (contract.groupLinks.length > 1) {
        throw new APIError(
          500,
          'Too many groups associated with this private contract'
        )
      }
    }

    return getContractParams(contract, db, true, auth?.uid)
  }
)
