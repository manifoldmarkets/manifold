import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { uniqBy } from 'lodash'
import { log } from 'shared/utils'
import { convertBet } from 'common/supabase/bets'
import { convertContractComment } from 'common/supabase/comments'

// todo: personalization based on followed users & topics
export const getSiteActivity: APIHandler<'get-site-activity'> = async (
  props
) => {
  const { limit, blockedGroupSlugs = [], blockedContractIds = [] } = props
  log('getSiteActivity called', { limit })

  const blockedUserIds = [
    'FDWTsTHFytZz96xmcKzf7S5asYL2', // yunabot (does a lot of manual trades)
    ...(props.blockedUserIds ?? []),
  ]
  const pg = createSupabaseDirectClient()

  const [recentBets, limitOrders, recentComments, newContracts] =
    await Promise.all([
      pg.manyOrNone(
        `select * from contract_bets
     where abs(amount) >= CASE
          WHEN EXISTS (
              SELECT 1 FROM contracts
              WHERE contracts.id = contract_bets.contract_id
              AND contracts.token = 'CASH'
          ) THEN 5
          ELSE 500
       END
     and is_api is not true
     and user_id != all($1)
     and contract_id != all($2)
     order by created_time desc limit $3`,
        [blockedUserIds, blockedContractIds, limit]
      ),
      pg.manyOrNone(
        `select * from contract_bets
       where amount = 0
       and (data->>'orderAmount')::numeric >= CASE
         when exists (
           select 1 from contracts
           where contracts.id = contract_bets.contract_id
           and contracts.token = 'CASH'
         ) then 50
         else 5000
       end
       and is_api is not true
       and (data->>'isFilled')::boolean = false
       and (data->>'isCancelled')::boolean = false
       and user_id != all($1)
       and contract_id != all($2)
       order by created_time desc limit $3`,
        [blockedUserIds, blockedContractIds, limit]
      ),
      pg.manyOrNone(
        `select * from contract_comments
       where (likes - coalesce(dislikes, 0)) >= 2
       and user_id != all($1)
       and contract_id != all($2)
       order by created_time desc limit $3`,
        [blockedUserIds, blockedContractIds, limit]
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
        [blockedUserIds, blockedContractIds, blockedGroupSlugs, limit]
      ),
    ])

  const contractIds = uniqBy(
    [
      ...recentBets.map((b) => b.contract_id),
      ...limitOrders.map((b) => b.contract_id),
      ...recentComments.map((c) => c.contract_id),
    ],
    (id) => id
  )

  const relatedContracts = await pg.manyOrNone(
    `select * from contracts where id = any($1)`,
    [contractIds]
  )

  return {
    bets: recentBets.concat(limitOrders).map(convertBet),
    comments: recentComments.map(convertContractComment),
    newContracts: filterDefined(newContracts.map(convertContract)),
    relatedContracts: filterDefined(relatedContracts.map(convertContract)),
  }
}
