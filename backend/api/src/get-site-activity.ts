import { APIError, APIHandler } from 'api/helpers/endpoint'
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
  const pg = createSupabaseDirectClient()
  let topicId = props.topicId
  if (topicSlug) {
    const topic = await pg.one(`select id from groups where slug = $1`, [
      topicSlug,
    ])
    if (!topic) {
      throw new APIError(404, 'Topic not found')
    }
    topicId = topic.id
  }
  const blockedUserIds = [
    'FDWTsTHFytZz96xmcKzf7S5asYL2', // yunabot (does a lot of manual trades)
    ...(props.blockedUserIds ?? []),
  ]

  // Build queries
  const recentBetsQuery = types.includes('bets')
    ? `SELECT cb.*
       FROM contract_bets cb
       ${
         topicId
           ? 'JOIN group_contracts gc ON cb.contract_id = gc.contract_id'
           : ''
       }
       WHERE abs(cb.amount) >= 500
         AND cb.is_api IS NOT TRUE
         AND cb.user_id != ALL($1)
         AND cb.contract_id != ALL($2)
         ${topicId ? 'AND gc.group_id = $6' : ''}
       ORDER BY cb.created_time DESC
       LIMIT $3 OFFSET $4;`
    : 'select null where false;'

  const limitOrdersQuery = types.includes('bets')
    ? `SELECT cb.*
       FROM contract_bets cb
       ${
         topicId
           ? 'JOIN group_contracts gc ON cb.contract_id = gc.contract_id'
           : ''
       }
       WHERE cb.amount = 0
         AND (cb.data->>'orderAmount')::numeric >= 5000
         AND cb.is_api IS NOT TRUE
         AND NOT cb.is_filled AND NOT cb.is_cancelled
         AND cb.user_id != ALL($1)
         AND cb.contract_id != ALL($2)
         ${topicId ? 'AND gc.group_id = $6' : ''}
       ORDER BY cb.created_time DESC
       LIMIT $3 OFFSET $4;`
    : 'select null where false;'

  const recentCommentsQuery = types.includes('comments')
    ? `SELECT cc.*
       FROM contract_comments cc
       ${
         topicId
           ? 'JOIN group_contracts gc ON cc.contract_id = gc.contract_id'
           : ''
       }
       WHERE (likes - coalesce(dislikes, 0)) >= 2
         AND cc.user_id != ALL($1)
         AND cc.contract_id != ALL($2)
         ${topicId ? 'AND gc.group_id = $6' : ''}
         --and data->>'hidden' != 'true'
       ORDER BY cc.created_time DESC
       LIMIT $3 OFFSET $4;`
    : 'select null where false;'

  const newContractsQuery = types.includes('markets')
    ? `SELECT c.*
       FROM contracts c
       ${topicId ? 'JOIN group_contracts gc ON c.id = gc.contract_id' : ''}
       WHERE c.visibility = 'public'
         AND c.creator_id != ALL($1)
         AND c.id != ALL($2)
         ${topicId ? 'AND gc.group_id = $6' : ''}
         AND NOT EXISTS (
           SELECT 1 FROM group_contracts gc
           JOIN groups g ON g.id = gc.group_id
           WHERE gc.contract_id = c.id
             AND g.slug = ANY($5)
         )
       ORDER BY c.created_time DESC
       LIMIT $3 OFFSET $4;`
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
    topicId,
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
