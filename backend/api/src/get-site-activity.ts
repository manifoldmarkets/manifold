import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { uniqBy } from 'lodash'
import { log } from 'shared/utils'
import { convertBet } from 'common/supabase/bets'
import { convertContractComment } from 'common/supabase/comments'

export const getSiteActivity: APIHandler<'get-site-activity'> = async (props) => {
  const { limit, blockedUserIds = [], blockedGroupSlugs = [], blockedContractIds = [] } = props
  const pg = createSupabaseDirectClient()
  log('getSiteActivity called', { limit })

  const [recentBets, recentComments, newContracts] = await Promise.all([
    pg.manyOrNone(
      `select * from contract_bets 
       where amount >= 500 
       and user_id != all($1)
       and contract_id != all($2)
       order by created_time desc limit $3`,
      [blockedUserIds, blockedContractIds, limit * 3]
    ),
    pg.manyOrNone(
      `select * from contract_comments
       where (likes - coalesce(dislikes, 0)) >= 2
       and user_id != all($1)
       and contract_id != all($2)
       order by created_time desc limit $3`,
      [blockedUserIds, blockedContractIds, limit * 3]
    ),
    pg.manyOrNone(
      `select * from contracts
       where visibility = 'public'
       and tier != 'play'
       and creator_id != all($1)
       and id != all($2)
       and not exists (
         select 1 from group_contracts gc
         join groups g on g.id = gc.group_id
         where gc.contract_id = contracts.id
         and g.slug = any($3)
       )
       order by created_time desc limit $4`,
      [blockedUserIds, blockedContractIds, blockedGroupSlugs, limit * 3]
    ),
  ])

  const contractIds = uniqBy([
    ...recentBets.map((b) => b.contract_id),
    ...recentComments.map((c) => c.contract_id)
  ], id => id)

  const relatedContracts = await pg.manyOrNone(
    `select * from contracts where id = any($1)`,
    [contractIds]
  )

  const contracts = filterDefined([
    ...newContracts.map(convertContract),
    ...relatedContracts.map(convertContract)
  ])

  return {
    bets: recentBets.map(convertBet),
    comments: recentComments.map(convertContractComment),
    contracts,
  }
}
