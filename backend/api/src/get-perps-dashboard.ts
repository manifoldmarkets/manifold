import { uniq } from 'lodash'
import { APIError } from 'common/api/utils'
import { PerpContract } from 'common/contract'
import { ENV, isAdminId } from 'common/envs/constants'
import { convertContract } from 'common/supabase/contracts'
import { convertUser } from 'common/supabase/users'
import { getPerpCreatorAccountIds } from 'shared/perps/creator-accounts'
import { requirePerpManager } from 'shared/perps/management-auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import {
  getPerpDashboardMarkets,
  summarizeAccount,
} from './helpers/perp-dashboard'

// Every perp market, not a fixed feed or creator list, so markets created
// later and under new creator accounts appear without code changes.
export const getPerpsDashboard: APIHandler<'get-perps-dashboard'> = async (
  _,
  auth
) => {
  if (!isAdminId(auth.uid))
    throw new APIError(403, 'Only admins can manage every perp market.')
  const pg = createSupabaseDirectClient()
  const payer = await requirePerpManager(pg, auth.uid)
  const asOf = Date.now()
  const rows = await pg.manyOrNone(
    `select * from contracts where mechanism = 'perp' order by created_time`
  )
  const contracts = rows.map(convertContract) as PerpContract[]
  const [users, markets] = await Promise.all([
    pg.map(
      'select * from users where id = any($1)',
      [uniq(contracts.map((c) => c.creatorId))],
      convertUser
    ),
    getPerpDashboardMarkets(pg, contracts, asOf),
  ])
  const fundable = getPerpCreatorAccountIds(ENV)
  return {
    asOf,
    payer: summarizeAccount(payer),
    creators: users.map((user) => ({
      ...summarizeAccount(user),
      name: user.name,
      canFund:
        fundable.includes(user.id) &&
        !user.userDeleted &&
        !user.isBannedFromPosting,
    })),
    markets,
  }
}
