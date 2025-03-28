import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { uniqBy } from 'lodash'
import { convertBet } from 'common/supabase/bets'
import { convertContractComment } from 'common/supabase/comments'

// todo: personalization based on followed users & topics
export const getSiteActivity: APIHandler<'get-site-activity'> = async (
  props
) => {
  const {
    limit,
    offset = 0,
    blockedGroupSlugs = [],
    blockedContractIds = [],
    topicSlug,
    types = ['bets', 'comments', 'markets'],
  } = props

  const blockedUserIds = [
    'FDWTsTHFytZz96xmcKzf7S5asYL2', // yunabot (does a lot of manual trades)
    ...(props.blockedUserIds ?? []),
  ]
  const pg = createSupabaseDirectClient()

  // Function to generate topic filter for any table
  const getTopicFilter = (tableName: string) =>
    topicSlug
      ? `and exists (
          select 1 from group_contracts gc
          join groups g on g.id = gc.group_id
          where gc.contract_id = ${
            tableName === 'contracts'
              ? tableName + '.id'
              : tableName + '.contract_id'
          }
          and g.slug = $6
        )`
      : ''

  // Build queries
  const recentBetsQuery = types.includes('bets')
    ? `select * from contract_bets
       where abs(amount) >= 500
       and is_api is not true
       and user_id != all($1)
       and contract_id != all($2)
       ${getTopicFilter('contract_bets')}
       order by created_time desc limit $3 offset $4;`
    : 'select null where false;'

  const limitOrdersQuery = types.includes('bets')
    ? `select * from contract_bets
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
       ${getTopicFilter('contract_bets')}
       order by created_time desc limit $3 offset $4;`
    : 'select null where false;'

  const recentCommentsQuery = types.includes('comments')
    ? `select * from contract_comments
       where (likes - coalesce(dislikes, 0)) >= 2
       and user_id != all($1)
       and contract_id != all($2)
       --and data->>'hidden' != 'true'
       ${getTopicFilter('contract_comments')}
       order by created_time desc limit $3 offset $4;`
    : 'select null where false;'

  const newContractsQuery = types.includes('markets')
    ? `select * from contracts
       where visibility = 'public'
       and creator_id != all($1)
       and id != all($2)
       and not exists (
         select 1 from group_contracts gc
         join groups g on g.id = gc.group_id
         where gc.contract_id = contracts.id
         and g.slug = any($5)
       )
       ${getTopicFilter('contracts')}
       order by created_time desc limit $3 offset $4;`
    : 'select null where false;'

  const multiQuery = `
    ${recentBetsQuery} --0
    ${limitOrdersQuery} --1
    ${recentCommentsQuery} --2
    ${newContractsQuery} --3
  `

  const results = await pg.multi(multiQuery, [
    blockedUserIds,
    blockedContractIds,
    limit,
    offset,
    blockedGroupSlugs,
    topicSlug,
  ])

  const recentBets = results[0] || []
  const limitOrders = results[1] || []
  const recentComments = results[2] || []
  const newContracts = results[3] || []

  const contractIds = uniqBy(
    [
      ...recentBets.map((b) => b.contract_id),
      ...limitOrders.map((b) => b.contract_id),
      ...recentComments.map((c) => c.contract_id),
    ],
    (id) => id
  )

  let relatedContracts = [] as any[]
  if (contractIds.length > 0) {
    relatedContracts = await pg.manyOrNone(
      `select * from contracts where id = any($1)`,
      [contractIds]
    )
  }

  return {
    bets: recentBets.concat(limitOrders).map(convertBet),
    comments: recentComments.map(convertContractComment),
    newContracts: filterDefined(newContracts.map(convertContract)),
    relatedContracts: filterDefined(relatedContracts.map(convertContract)),
  }
}
