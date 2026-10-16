import { z } from 'zod'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  isContractUninterested,
  setContractUninterested,
} from 'shared/supabase/user-disinterests'
import { APIHandler, authEndpoint, validate } from './helpers/endpoint'

export const setMarketUninterested: APIHandler<
  'market/:contractId/uninterested'
> = async ({ contractId, uninterested }, auth) => {
  const pg = createSupabaseDirectClient()
  return await setContractUninterested(pg, auth.uid, contractId, uninterested)
}

export const getMarketUninterestedStatus: APIHandler<
  'market/:contractId/uninterested-status'
> = async ({ contractId }, auth) => {
  const pg = createSupabaseDirectClient()
  return {
    uninterested: await isContractUninterested(pg, auth.uid, contractId),
  }
}

// The route web bundles called before the typed endpoint existed. Kept so a
// stale tab keeps working; it gets the same semantics minus the result. The
// creator and feed ids it used to send are ignored: the creator is read from
// the market, and undo no longer depends on matching a feed id.
const legacyBodySchema = z
  .object({
    contractId: z.string(),
    creatorId: z.string().optional(),
    feedId: z.number().optional(),
    removeContract: z.boolean().optional(),
  })
  .strict()

export const updateUserDisinterestEmbedding = authEndpoint(
  async (req, auth) => {
    const { contractId, removeContract } = validate(legacyBodySchema, req.body)
    await setContractUninterested(
      createSupabaseDirectClient(),
      auth.uid,
      contractId,
      !removeContract
    )
    return { success: true }
  }
)
