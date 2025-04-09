import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { filterDefined } from 'common/util/array'
import { uniqBy } from 'lodash'
import { convertBet } from 'common/supabase/bets'
import { CommentWithTotalReplies } from 'common/comment'
import { mapValues, uniq } from 'lodash'
import { keyBy } from 'lodash'
import { getContractsDirect } from 'shared/supabase/contracts'

// todo: personalization based on followed users & topics
// TODO: maybe run comments by gemini to make sure they're interesting
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
    minBetAmount,
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
  // Common query parts
  const betsSelect = `SELECT cb.*
       FROM contract_bets cb
       ${
         topicId
           ? 'JOIN group_contracts gc ON cb.contract_id = gc.contract_id'
           : ''
       }`
  const betsEnd = `
    AND cb.user_id != ALL($1)
    AND cb.contract_id != ALL($2)
    AND not cb.is_api
    ${topicId ? 'AND gc.group_id = $6' : ''}
     ORDER BY cb.created_time DESC
    LIMIT $3 OFFSET $4;
  `
  // Build queries
  const recentBetsQuery = types.includes('bets')
    ? `${betsSelect}
       WHERE abs(cb.amount) >= $7
       ${betsEnd}`
    : 'select null where false;'

  const limitOrdersQuery = types.includes('bets')
    ? `${betsSelect}
       WHERE cb.amount = 0
         AND (cb.data->>'orderAmount')::numeric >= $7
         AND NOT cb.is_filled AND NOT cb.is_cancelled
        ${betsEnd}`
    : 'select null where false;'

  const recentCommentsQuery = types.includes('comments')
    ? `SELECT
           cc.contract_id,
           cc.comment_id,
           cc.data,
           cc2.data as reply_to_data
       FROM contract_comments cc
       ${
         topicId
           ? 'JOIN group_contracts gc ON cc.contract_id = gc.contract_id'
           : ''
       }
       LEFT JOIN contract_comments cc2 ON cc2.comment_id = cc.data->>'replyToCommentId'
      WHERE cc.user_id != ALL($1)
         AND cc.contract_id != ALL($2)
         ${topicId ? 'AND gc.group_id = $6' : ''}
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
    minBetAmount ?? 500,
  ])

  const recentBets = results[0] || []
  const limitOrders = results[1] || []
  const recentCommentRecords = (results[2] || []) as {
    contract_id: string
    comment_id: string
    data: CommentWithTotalReplies
    reply_to_data?: CommentWithTotalReplies
  }[]
  const newContracts = results[3] || []

  const parentCommentIds = uniq(
    filterDefined(recentCommentRecords.map((rc) => rc.reply_to_data?.id))
  )

  const baseCommentData = recentCommentRecords
    .filter((rc) => !rc.reply_to_data?.hidden && !rc.data.hidden)
    .filter(
      (rc) =>
        !JSON.stringify(rc.data.content).includes('"label":"mods"') &&
        !JSON.stringify(rc.data.content)
          .toLowerCase()
          .includes('please resolve') &&
        !JSON.stringify(rc.reply_to_data?.content ?? {}).includes(
          '"label":"mods"'
        )
    )
    .flatMap((rc) => filterDefined([rc.reply_to_data, rc.data]))
  const initialUniqueComments = uniqBy(baseCommentData, 'id')

  const contractIds = uniq([
    ...recentBets.map((b) => b.contract_id),
    ...limitOrders.map((b) => b.contract_id),
    ...initialUniqueComments.map((c) => c.contractId),
    ...newContracts.map((c) => c.id), // Include newly created contracts
  ])

  // Parallel fetching of reply counts and related contracts
  const [replyCountsResult, contractsResult] = await Promise.all([
    parentCommentIds.length > 0
      ? pg.manyOrNone<{ parent_id: string; total_replies: number }>(
          `SELECT data->>'replyToCommentId' as parent_id, COUNT(*) as total_replies
           FROM contract_comments
           WHERE data->>'replyToCommentId' = ANY($1)
           GROUP BY parent_id;`,
          [parentCommentIds]
        )
      : Promise.resolve([]), // Resolve empty array if no parent IDs
    contractIds.length > 0
      ? getContractsDirect(contractIds, pg)
      : Promise.resolve([]), // Resolve empty array if no contract IDs
  ])

  const replyCounts = mapValues(
    keyBy(replyCountsResult, 'parent_id'),
    (c) => c.total_replies
  )

  const commentsWithReplyCounts = initialUniqueComments.map((comment) => {
    if (!comment.replyToCommentId) {
      // It's a parent comment
      return { ...comment, totalReplies: replyCounts[comment.id] ?? 0 }
    }
    return comment
  })

  return {
    bets: recentBets.concat(limitOrders).map(convertBet),
    comments: commentsWithReplyCounts,
    newContracts: filterDefined(newContracts.map(convertContract)),
    relatedContracts: filterDefined(contractsResult), // Already converted by getContractsDirect
  }
}
