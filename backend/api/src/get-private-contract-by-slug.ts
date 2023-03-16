import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
const bodySchema = z.object({
  contractSlug: z.string(),
})

export const getprivatecontractbyslug = authEndpoint(async (req, auth) => {
  const { contractSlug } = validate(bodySchema, req.body)
  if (!auth.uid) {
    return false
  }
  const pg = createSupabaseDirectClient()

  const contract = (
    await pg.one("select data from contracts where data->>'slug' = $1", [
      contractSlug,
    ])
  ).data

  if (!contract) {
    throw new APIError(400, 'This contract does not exist!')
  }

  if (!contract.visibility || contract.visibility != 'private') {
    throw new APIError(
      400,
      'How did you get here? This contract is not private...'
    )
  }

  if (!contract.groupLinks) {
    throw new APIError(400, 'No associated group with this private contract.')
  }

  if (contract.groupLinks.length > 1) {
    throw new APIError(
      400,
      'Too many groups associated with this private contract!'
    )
  }

  const groupId = contract.groupLinks[0].groupId

  // checks if user is member
  const userCanAccess = (
    await pg.one(
      `select exists(
        select * from group_role
        where group_id = '${groupId}'
        and member_id='${auth.uid}'
        )`
    )
  ).exists

  if (userCanAccess) {
    return contract
  }
  return null
})
