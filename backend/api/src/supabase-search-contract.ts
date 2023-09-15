import { z } from 'zod'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'
import {
  hasGroupAccess,
  getSearchContractSQL,
  getForYouSQL,
} from 'shared/supabase/search-contracts'
import { getGroupIdFromSlug } from 'shared/supabase/groups'

export const supabasesearchcontracts = MaybeAuthedEndpoint(
  async (req, auth) => {
    const {
      term,
      filter,
      sort,
      contractType,
      offset,
      limit,
      fuzzy,
      groupId: trueGroupId,
      creatorId,
    } = validate(bodySchema, req.body)

    const isForYou = trueGroupId === 'for-you'
    const groupSlug = trueGroupId && !isForYou ? trueGroupId : undefined
    const pg = createSupabaseDirectClient()
    const groupId = groupSlug
      ? await getGroupIdFromSlug(groupSlug, pg)
      : undefined

    const searchMarketSQL =
      isForYou && !term && sort === 'score' && auth?.uid
        ? getForYouSQL(auth.uid, filter, contractType, limit, offset)
        : getSearchContractSQL({
            term,
            filter,
            sort,
            contractType,
            offset,
            limit,
            fuzzy,
            groupId,
            creatorId,
            uid: auth?.uid,
            isForYou,
            hasGroupAccess: await hasGroupAccess(groupId, auth?.uid),
          })

    const contracts = await pg.map(
      searchMarketSQL,
      [term],
      (r) => r.data as Contract
    )

    return (contracts ?? []) as unknown as Json
  }
)

export const FIRESTORE_DOC_REF_ID_REGEX = /^[a-zA-Z0-9_-]{1,}$/

const bodySchema = z.object({
  term: z.string(),
  filter: z.union([
    z.literal('open'),
    z.literal('closing-this-month'),
    z.literal('closing-next-month'),
    z.literal('closed'),
    z.literal('resolved'),
    z.literal('all'),
  ]),
  sort: z.union([
    z.literal('newest'),
    z.literal('score'),
    z.literal('daily-score'),
    z.literal('24-hour-vol'),
    z.literal('most-popular'),
    z.literal('liquidity'),
    z.literal('last-updated'),
    z.literal('close-date'),
    z.literal('resolve-date'),
    z.literal('random'),
    z.literal('bounty-amount'),
    z.literal('prob-descending'),
    z.literal('prob-ascending'),
  ]),
  contractType: z.union([
    z.literal('ALL'),
    z.literal('BINARY'),
    z.literal('MULTIPLE_CHOICE'),
    z.literal('FREE_RESPONSE'),
    z.literal('PSEUDO_NUMERIC'),
    z.literal('BOUNTIED_QUESTION'),
    z.literal('STONK'),
    z.literal('POLL'),
  ]),
  offset: z.number().gte(0),
  limit: z.number().gt(0),
  fuzzy: z.boolean().optional(),
  groupId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
  creatorId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
})
