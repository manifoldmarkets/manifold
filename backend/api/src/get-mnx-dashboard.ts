import { PerpContract } from 'common/contract'
import { ENV } from 'common/envs/constants'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { convertContract } from 'common/supabase/contracts'
import { convertUser } from 'common/supabase/users'
import { getMnxCreatorId } from 'shared/perps/creator-accounts'
import { requirePerpManager } from 'shared/perps/management-auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import {
  getPerpDashboardMarkets,
  summarizeAccount,
} from './helpers/perp-dashboard'

export const getMnxDashboard: APIHandler<'get-mnx-dashboard'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const payer = await requirePerpManager(pg, auth.uid)
  const ownerId = getMnxCreatorId(ENV)
  const account = ownerId
    ? await pg.oneOrNone(
        'select * from users where id = $1',
        [ownerId],
        convertUser
      )
    : null
  const asOf = Date.now()
  const rows = await pg.manyOrNone(
    `select * from contracts
      where mechanism = 'perp' and creator_id = $1
        and data->>'oracleFeedId' = any($2)
      order by created_time`,
    [ownerId ?? null, MNX_INSTRUMENTS.map((i) => i.feedId)]
  )
  const contracts = rows.map(convertContract) as PerpContract[]
  return {
    asOf,
    account: account ? summarizeAccount(account) : null,
    payer: summarizeAccount(payer),
    markets: await getPerpDashboardMarkets(pg, contracts, asOf),
  }
}
