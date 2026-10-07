import { isAdminId, isModId } from 'common/envs/constants'
import { getLinkChildError, getLinkParentError } from 'common/market-links'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  deleteMarketLink,
  getLinkedChildCount,
  getLinkParentCandidate,
  getMarketLinkParent,
  upsertMarketLink,
} from 'shared/supabase/market-links'
import { getContract } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

const isMod = (userId: string) => isModId(userId) || isAdminId(userId)

// Links a market to the market it's about, or moves it to a new one. The
// market's creator decides what it's about; mods can fix a wrong link.
export const linkMarket: APIHandler<'link-market'> =
  onlyUsersWhoCanPerformAction('updateMarket', async (props, auth) => {
    const { contractId, parentContractId, relation = 'related' } = props
    const pg = createSupabaseDirectClient()

    const child = await getContract(pg, contractId)
    if (!child) throw new APIError(404, 'Market not found')
    if (child.creatorId !== auth.uid && !isMod(auth.uid))
      throw new APIError(
        403,
        "Only the market's creator or a mod can link it to another market"
      )

    const childError = getLinkChildError({
      visibility: child.visibility,
      deleted: !!child.deleted,
      childCount: await getLinkedChildCount(pg, contractId),
    })
    if (childError) throw new APIError(400, childError)

    const parent = await getLinkParentCandidate(pg, parentContractId)
    const parentError = getLinkParentError(parent, contractId)
    if (parentError) throw new APIError(400, parentError)

    await upsertMarketLink(pg, {
      childId: contractId,
      parentId: parentContractId,
      relation,
      createdBy: auth.uid,
    })
    return { success: true as const }
  })

// Removes a market's link. The parent's creator can unlink too, so nobody
// can park an unrelated market under someone else's.
export const unlinkMarket: APIHandler<'unlink-market'> =
  onlyUsersWhoCanPerformAction('updateMarket', async (props, auth) => {
    const { contractId } = props
    const pg = createSupabaseDirectClient()

    const link = await getMarketLinkParent(pg, contractId)
    if (!link) return { success: true as const }

    const [child, parent] = await Promise.all([
      getContract(pg, contractId),
      getContract(pg, link.parent_contract_id),
    ])
    const allowed =
      isMod(auth.uid) ||
      child?.creatorId === auth.uid ||
      parent?.creatorId === auth.uid
    if (!allowed)
      throw new APIError(
        403,
        "Only the market's creator, the linked market's creator or a mod can unlink it"
      )

    await deleteMarketLink(pg, contractId)
    return { success: true as const }
  })
