import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { convertBet } from 'common/supabase/bets'
import { PrivateUser } from 'common/user'
import { keyBy, mapValues, orderBy, uniq, uniqBy } from 'lodash'
import { filterDefined } from 'common/util/array'
import {
  from,
  renderSql,
  select,
  join,
  limit as lim,
  where,
  orderBy as order,
  groupBy,
} from 'shared/supabase/sql-builder'
import { buildArray } from 'common/util/array'
import { log } from 'shared/utils'
import {
  activeTopics,
  buildUserInterestsCache,
  minimumContractsQualityBarWhereClauses,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { privateUserBlocksSql } from 'shared/supabase/search-contracts'
import { getFollowedReposts, getTopicReposts } from 'shared/supabase/reposts'
import { FeedContract, GROUP_SCORE_PRIOR } from 'common/feed'
import { CommentWithTotalReplies } from 'common/comment'
import { JSONContent } from '@tiptap/core'
import { contractColumnsToSelect } from 'shared/utils'

export const getUnifiedFeed: APIHandler<'get-unified-feed'> = async (props) => {
  const {
    userId,
    feedLimit,
    feedOffset,
    activityLimit,
    activityOffset,
    ignoreContractIds,
    blockedUserIds: propsBlockedUserIds,
    blockedGroupSlugs = [],
    blockedContractIds: propsBlockedContractIds = [],
    minBetAmount = 100,
  } = props

  const pg = createSupabaseDirectClient()
  const startTime = Date.now()

  // Get private user data for blocking
  const privateUser = userId
    ? await pg.oneOrNone(
        `select data from private_users where id = $1`,
        [userId],
        (r) => r?.data as PrivateUser | undefined
      )
    : undefined

  const blockedUserIds = [
    'FDWTsTHFytZz96xmcKzf7S5asYL2', // yunabot
    ...(propsBlockedUserIds ?? []),
  ]
  const blockedContractIds = [
    ...propsBlockedContractIds,
    ...(ignoreContractIds ?? []),
  ]

  // Run feed, activity, and boosted queries in parallel
  const [feedResult, activityResult, boostedContracts] = await Promise.all([
    userId
      ? fetchPersonalizedFeed(
          pg,
          userId,
          feedLimit,
          feedOffset,
          ignoreContractIds,
          privateUser ?? undefined
        )
      : fetchTrendingFeed(pg, feedLimit, feedOffset),
    fetchSiteActivity(
      pg,
      activityLimit,
      activityOffset,
      blockedUserIds,
      blockedGroupSlugs,
      blockedContractIds,
      minBetAmount
    ),
    fetchBoostedContracts(pg, blockedContractIds, blockedUserIds),
  ])

  log('unified feed queries completed in (s):', (Date.now() - startTime) / 1000)

  return {
    ...feedResult,
    boostedContracts,
    activityBets: activityResult.bets,
    activityComments: activityResult.comments,
    activityNewContracts: activityResult.newContracts,
    activityRelatedContracts: activityResult.relatedContracts,
  }
}

// Personalized feed for logged-in users
async function fetchPersonalizedFeed(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  userId: string,
  limit: number,
  offset: number,
  ignoreContractIds: string[] | undefined,
  privateUser: PrivateUser | undefined
) {
  // Build user interests cache if needed
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache([userId])
  }

  // If no topic interests, return trending
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    const defaultContracts = await pg.map(
      `select data, importance_score, conversion_score, freshness_score, view_count, token from contracts
       order by importance_score desc
       limit $1 offset $2`,
      [limit * 4, offset],
      (r) => convertContract(r)
    )
    return {
      contracts: defaultContracts,
      idsToReason: Object.fromEntries(
        defaultContracts.map((c) => [c.id, 'importance'])
      ),
      comments: [],
      bets: [],
      reposts: [],
    }
  }

  const userInterestTopicIds = Object.keys(
    userIdsToAverageTopicConversionScores[userId]
  )
  const userInterestTopicWeights = Object.values(
    userIdsToAverageTopicConversionScores[userId]
  )
  const newUser = userInterestTopicIds.length < 100

  if (!newUser) {
    // Add top trending topics
    const topUnseenActiveTopics = orderBy(
      Object.entries(activeTopics).filter(
        ([topicId]) => !userInterestTopicIds.includes(topicId)
      ),
      ([, score]) => score,
      'desc'
    ).slice(0, 10)
    userInterestTopicIds.push(
      ...topUnseenActiveTopics.map(([topicId]) => topicId)
    )
    userInterestTopicWeights.push(
      ...topUnseenActiveTopics.map(([, score]) => score)
    )
  }

  const MAX_TOPICS_TO_EVALUATE = 350
  const cutoffIndex =
    userInterestTopicWeights.length > MAX_TOPICS_TO_EVALUATE
      ? Math.min(
          userInterestTopicWeights.filter((w) => w > GROUP_SCORE_PRIOR).length,
          MAX_TOPICS_TO_EVALUATE
        )
      : userInterestTopicWeights.length

  const baseQueryArray = () =>
    buildArray(
      select('contracts.*'),
      select(`avg(uti.topic_score) as topic_conversion_score`),
      from(
        `(select unnest(array[$1]) as group_id, unnest(array[$2]) as topic_score) as uti`,
        [
          userInterestTopicIds.slice(0, cutoffIndex),
          userInterestTopicWeights.slice(0, cutoffIndex),
        ]
      ),
      join(`group_contracts on group_contracts.group_id = uti.group_id`),
      join(`contracts on contracts.id = group_contracts.contract_id`),
      where(
        'not exists (select 1 from user_contract_views where user_id = $1 and contract_id = contracts.id)',
        [userId]
      ),
      ...minimumContractsQualityBarWhereClauses(),
      where(
        `contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)`,
        [userId]
      ),
      (ignoreContractIds?.length ?? 0) > 0 &&
        where(`contracts.id <> all(array[$1])`, [ignoreContractIds]),
      privateUser && privateUserBlocksSql(privateUser),
      lim(limit, offset),
      groupBy(`contracts.id`)
    )

  const followedQuery = renderSql(
    ...baseQueryArray(),
    where(
      `contracts.creator_id in (select follow_id from user_follows where user_id = $1)`,
      [userId]
    ),
    order(`contracts.conversion_score desc`)
  )

  // Run optimized parallel queries - combine conversion and freshness into single query
  const combinedQuery = renderSql(
    ...baseQueryArray(),
    order(`avg(uti.topic_score * contracts.conversion_score * contracts.freshness_score) desc`)
  )

  const [combinedContracts, followedContracts, followedRepostData, topicRepostData] =
    await Promise.all([
      pg.map(
        combinedQuery,
        [],
        (r) =>
          ({
            contract: convertContract(r),
            topicConversionScore: r.topic_conversion_score as number,
          } as FeedContract)
      ),
      pg.map(
        followedQuery,
        [],
        (r) =>
          ({
            contract: convertContract(r),
            topicConversionScore: r.topic_conversion_score as number,
          } as FeedContract)
      ),
      getFollowedReposts(
        userId,
        limit,
        offset,
        userIdsToAverageTopicConversionScores[userId],
        privateUser
          ? renderSql(privateUserBlocksSql(privateUser)).replace('where', 'and')
          : '',
        pg
      ),
      getTopicReposts(
        userId,
        limit,
        offset,
        userInterestTopicIds,
        userInterestTopicWeights,
        privateUser
          ? renderSql(privateUserBlocksSql(privateUser)).replace('where', 'and')
          : '',
        pg
      ),
    ])

  const allReposts = followedRepostData.concat(topicRepostData)

  const contracts = uniqBy(
    orderBy(
      combinedContracts.concat(followedContracts, allReposts),
      (c) =>
        c.contract.conversionScore *
        c.contract.freshnessScore *
        c.topicConversionScore,
      'desc'
    ).map((c) => c.contract),
    (c) => c.id
  )

  const idsToReason: { [id: string]: string } = Object.fromEntries(
    contracts.map((c) => [
      c.id,
      followedContracts.find((cc) => cc.contract.id === c.id)
        ? 'followed'
        : 'trending',
    ])
  )

  return {
    contracts,
    idsToReason,
    comments: filterDefined(allReposts.map((c) => c.comment)),
    bets: filterDefined(allReposts.map((c) => c.bet)),
    reposts: filterDefined(allReposts.map((c) => c.repost)),
  }
}

// Trending feed for logged-out users
async function fetchTrendingFeed(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  limit: number,
  offset: number
) {
  const contracts = await pg.map(
    `select data, importance_score, conversion_score, freshness_score, view_count, token from contracts
     where close_time > now()
       and visibility = 'public'
       and outcome_type != 'STONK'
       and outcome_type != 'BOUNTIED_QUESTION'
     order by importance_score desc
     limit $1 offset $2`,
    [limit, offset],
    (r) => convertContract(r)
  )

  return {
    contracts,
    idsToReason: Object.fromEntries(contracts.map((c) => [c.id, 'trending'])),
    comments: [],
    bets: [],
    reposts: [],
  }
}

// Site activity (simplified version focusing on performance)
async function fetchSiteActivity(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  limit: number,
  offset: number,
  blockedUserIds: string[],
  blockedGroupSlugs: string[],
  blockedContractIds: string[],
  minBetAmount: number
) {
  let blockedTopicIds: string[] = []
  if (blockedGroupSlugs.length > 0) {
    const blockedTopics = await pg.manyOrNone(
      `select id from groups where slug = ANY($1)`,
      [blockedGroupSlugs]
    )
    blockedTopicIds = blockedTopics.map((t) => t.id)
  }

  // Single combined query for bets, comments, and new contracts
  const multiQuery = `
    -- Recent bets
    SELECT distinct on (cb.created_time) cb.*
    FROM contract_bets cb
    WHERE abs(cb.amount) >= $1
      AND cb.user_id != ALL($2)
      AND cb.contract_id != ALL($3)
      AND not cb.is_api
      AND NOT cb.is_redemption
    ORDER BY cb.created_time DESC
    LIMIT $4 OFFSET $5;

    -- Recent comments
    SELECT distinct on (cc.created_time)
      cc.contract_id,
      cc.comment_id,
      cc.data,
      cc2.data as reply_to_data
    FROM contract_comments cc
    LEFT JOIN contract_comments cc2 ON cc2.comment_id = cc.data->>'replyToCommentId'
    WHERE cc.user_id != ALL($2)
      AND cc.contract_id != ALL($3)
      AND cc.visibility = 'public'
    ORDER BY cc.created_time DESC
    LIMIT $4 OFFSET $5;

    -- New contracts
    SELECT distinct on (c.created_time) c.*
    FROM contracts c
    WHERE c.creator_id != ALL($2)
      AND c.id != ALL($3)
      AND is_valid_contract(c)
      ${blockedTopicIds.length > 0 ? `AND NOT EXISTS (
        SELECT 1 FROM group_contracts gc2
        WHERE gc2.contract_id = c.id AND gc2.group_id = ANY($6)
      )` : ''}
    ORDER BY c.created_time DESC
    LIMIT $4 OFFSET $5;
  `

  const results = await pg.multi(multiQuery, [
    minBetAmount,
    blockedUserIds,
    blockedContractIds,
    limit,
    offset,
    blockedTopicIds,
  ])

  const recentBets = results[0] || []
  const recentCommentRecords = (results[1] || []) as {
    contract_id: string
    comment_id: string
    data: CommentWithTotalReplies
    reply_to_data?: CommentWithTotalReplies
  }[]
  const newContracts = results[2] || []

  // Filter and process comments
  const baseCommentData = recentCommentRecords
    .filter((rc) => !rc.reply_to_data?.hidden && !rc.data.hidden)
    .filter(
      (rc) =>
        !hasContentWithText(rc.data.content, [
          '"label":"mods"',
          'please resolve',
          'resolve please',
        ]) && !rc.data.isApi
    )
    .flatMap((rc) => filterDefined([rc.reply_to_data, rc.data]))
  const initialUniqueComments = uniqBy(baseCommentData, 'id')

  // Get parent comment IDs for reply counts
  const parentCommentIds = uniq(
    filterDefined(recentCommentRecords.map((rc) => rc.reply_to_data?.id))
  )

  const contractIds = uniq([
    ...recentBets.map((b) => b.contract_id),
    ...initialUniqueComments.map((c) => c.contractId),
    ...newContracts.map((c) => c.id),
  ])

  // Parallel fetch for reply counts and contracts
  const [replyCountsResult, contractsResult] = await Promise.all([
    parentCommentIds.length > 0
      ? pg.manyOrNone<{ parent_id: string; total_replies: number }>(
          `SELECT data->>'replyToCommentId' as parent_id, COUNT(*) as total_replies
           FROM contract_comments
           WHERE data->>'replyToCommentId' = ANY($1)
           GROUP BY parent_id`,
          [parentCommentIds]
        )
      : Promise.resolve([]),
    contractIds.length > 0
      ? pg.map(
          `select ${contractColumnsToSelect} from contracts where id in ($1:list)
           and (resolution is null or resolution != 'CANCEL')
           and visibility = 'public'
           and (close_time is null or close_time > now() - interval '1 hour')`,
          [contractIds],
          convertContract
        )
      : Promise.resolve([]),
  ])

  const replyCounts = mapValues(
    keyBy(replyCountsResult, 'parent_id'),
    (c) => c.total_replies
  )

  const commentsWithReplyCounts = initialUniqueComments.map((comment) => {
    if (!comment.replyToCommentId) {
      return { ...comment, totalReplies: replyCounts[comment.id] ?? 0 }
    }
    return comment
  })

  return {
    bets: recentBets
      .map(convertBet)
      .filter((b) => contractsResult.some((c) => c.id === b.contractId)),
    comments: commentsWithReplyCounts.filter((c) =>
      contractsResult.some((con) => con.id === c.contractId)
    ),
    newContracts: filterDefined(newContracts.map(convertContract)),
    relatedContracts: filterDefined(contractsResult),
  }
}

function hasContentWithText(
  content: JSONContent | undefined,
  texts: string[]
): boolean {
  const contentStr = JSON.stringify(content ?? {})
  return texts.some((text) =>
    contentStr.toLowerCase().includes(text.toLowerCase())
  )
}

// Fetch currently boosted markets
async function fetchBoostedContracts(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  blockedContractIds: string[],
  blockedUserIds: string[]
) {
  return pg.map(
    `select ${contractColumnsToSelect} from contracts c
     where c.boosted = true
       and c.close_time > now()
       and c.visibility = 'public'
       and is_valid_contract(c)
       ${blockedContractIds.length > 0 ? 'and c.id != ALL($1)' : ''}
       ${blockedUserIds.length > 0 ? 'and c.creator_id != ALL($2)' : ''}
     order by c.importance_score desc
     limit 5`,
    [blockedContractIds, blockedUserIds],
    convertContract
  )
}
