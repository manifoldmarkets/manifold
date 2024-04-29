import { APIHandler } from 'api/helpers/endpoint'
import {
  createSupabaseDirectClient,
  getInstanceId,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { PrivateUser } from 'common/user'
import { chunk, orderBy, uniqBy } from 'lodash'
import {
  from,
  renderSql,
  select,
  join,
  limit as lim,
  where,
  orderBy as order,
  leftJoin,
  groupBy,
} from 'shared/supabase/sql-builder'
import { buildArray, filterDefined } from 'common/util/array'
import { log } from 'shared/utils'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { Row } from 'common/supabase/utils'

const userIdsToAverageTopicConversionScores: {
  [userId: string]: { [groupId: string]: number }
} = {}
const DEBUG = process.platform === 'darwin'
export const getFeed: APIHandler<'get-feed'> = async (props) => {
  const { limit, offset, ignoreContractIds } = props
  const pg = createSupabaseDirectClient()
  // Use random user ids so that postgres doesn't cache the query:
  const userId = DEBUG
    ? await pg.one(
        `select user_id from user_contract_interactions
            where created_time > now() - interval '10 minutes'
            order by random() limit 1`,
        [],
        (r) => r.user_id as string
      )
    : props.userId

  if (userIdsToAverageTopicConversionScores[userId] === undefined) {
    await buildUserInterestsCache(userId)
  }
  const privateUser = await pg.one(
    `select data from private_users where id = $1`,
    [userId],
    (r) => r.data as PrivateUser
  )
  const {
    blockedByUserIds,
    blockedContractIds,
    blockedUserIds,
    blockedGroupSlugs,
  } = privateUser
  const blockedIds = blockedUserIds.concat(blockedByUserIds)

  const leftJoinClause = renderSql(
    select(
      `contract_id, max(greatest(ucv.last_page_view_ts, ucv.last_promoted_view_ts, ucv.last_card_view_ts)) AS latest_seen_time`
    ),
    from(`user_contract_views ucv`),
    where(`ucv.user_id = $1`, [userId]),
    groupBy(`contract_id`)
  )
  const baseQueryArray = buildArray(
    select(`contracts.*, uti.avg_conversion_score as topic_conversion_score`),
    from(
      `(select
               unnest(array[$1]) as group_id,
               unnest(array[$2]) as avg_conversion_score) as uti`,
      [
        Object.keys(userIdsToAverageTopicConversionScores[userId]),
        Object.values(userIdsToAverageTopicConversionScores[userId]),
      ]
    ),
    join(`groups on groups.id = uti.group_id`),
    join(`group_contracts on group_contracts.group_id = uti.group_id`),
    join(`contracts on contracts.id = group_contracts.contract_id`),
    // Another option: get the top 1000 contracts by uti.CS * contracts.CS and then filter by user_contract_views
    leftJoin(`(${leftJoinClause}) cv ON cv.contract_id = contracts.id`),
    where(`contracts.close_time > now() and contracts.visibility = 'public'`),
    where(
      `contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)`,
      [userId]
    ),
    (ignoreContractIds?.length ?? 0) > 0 &&
      where(`contracts.id <> any(array[$1])`, [ignoreContractIds]),
    blockedIds.length > 0 &&
      where(`contracts.creator_id <> any(array[$1])`, [blockedIds]),
    blockedContractIds.length > 0 &&
      where(`contracts.id <> any(array[$1])`, [blockedContractIds]),
    blockedGroupSlugs.length > 0 &&
      where(`groups.slug <> any(array[$1])`, [blockedGroupSlugs]),
    lim(limit, offset)
  )

  const followedQuery = renderSql(
    ...baseQueryArray,
    where(
      `contracts.creator_id in (select follow_id from user_follows where user_id = $1)`,
      [userId]
    ),
    order(`cv.latest_seen_time nulls first, contracts.conversion_score desc`)
  )
  const sorts = {
    conversion: `cv.latest_seen_time nulls first, uti.avg_conversion_score  * contracts.conversion_score desc`,
    importance: `cv.latest_seen_time nulls first, uti.avg_conversion_score  * contracts.importance_score desc`,
    freshness: `cv.latest_seen_time nulls first, uti.avg_conversion_score  * contracts.freshness_score desc`,
  }
  const sortQueries = Object.values(sorts).map((orderQ) =>
    renderSql(...baseQueryArray, order(orderQ))
  )
  type contractWithTopicScore = {
    contract: Contract
    topicConversionScore: number
    comment?: ContractComment
    repost?: Row<'posts'>
    bet?: Bet
  }
  if (DEBUG) {
    const explain = await pg.many(`explain analyze ${sortQueries[0]}`, [])
    log('explain:', explain.map((q) => q['QUERY PLAN']).join('\n'))
  }
  const startTime = Date.now()
  const [
    convertingContracts,
    importantContracts,
    freshContracts,
    followedContracts,
    repostData,
  ] = await Promise.all([
    ...sortQueries.map((sortQuery) =>
      pg.map(
        sortQuery,
        [],
        (r) =>
          ({
            contract: convertContract(r),
            topicConversionScore: r.topic_conversion_score as number,
          } as contractWithTopicScore)
      )
    ),
    pg.map(
      followedQuery,
      [],
      (r) =>
        ({
          contract: convertContract(r),
          topicConversionScore: r.topic_conversion_score as number,
        } as contractWithTopicScore)
    ),
    pg.map(
      `select
         contracts.data as contract_data,
         contracts.importance_score,
         contracts.view_count,
         contracts.conversion_score,
         contracts.freshness_score,
         contract_comments.data as comment,
         contract_bets.data as bet_data,
         posts.*
        from posts
           join user_contract_views ucv on posts.contract_id = ucv.contract_id and ucv.user_id = $1
           join contracts on posts.contract_id = contracts.id
           join contract_comments on posts.contract_comment_id = contract_comments.comment_id
           left join contract_bets on contract_comments.data->>'betId' = contract_bets.bet_id
            where posts.user_id in ( select follow_id from user_follows where user_id = $1)
            and posts.created_time > greatest(ucv.last_card_view_ts, ucv.last_page_view_ts)
            and posts.created_time > now() - interval '1 week';
`,
      [userId],
      (r) => {
        const {
          contract_data,
          importance_score,
          view_count,
          freshness_score,
          conversion_score,
          comment,
          bet_data,
          ...rest
        } = r as any
        return {
          contract: convertContract({
            data: contract_data,
            importance_score,
            view_count,
            freshness_score,
            conversion_score,
          }),
          comment: comment as ContractComment,
          bet: bet_data as Bet,
          topicConversionScore: 1,
          repost: rest,
        } as contractWithTopicScore
      }
    ),
  ])
  log('feed queries completed in (s):', (Date.now() - startTime) / 1000, {
    userId,
    ignoreContractIds: ignoreContractIds?.length,
  })

  const contracts = uniqBy(
    orderBy(
      convertingContracts.concat(
        importantContracts,
        freshContracts,
        followedContracts,
        repostData
      ),
      (c) =>
        c.contract.conversionScore *
        c.contract.importanceScore *
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
        : convertingContracts.find((cc) => cc.contract.id === c.id)
        ? 'conversion'
        : importantContracts.find((cc) => cc.contract.id === c.id)
        ? 'importance'
        : freshContracts.find((cc) => cc.contract.id === c.id)
        ? 'freshness'
        : '',
    ])
  )

  return {
    contracts,
    idsToReason,
    comments: filterDefined(repostData.map((c) => c.comment)),
    bets: filterDefined(repostData.map((c) => c.bet)),
    reposts: filterDefined(repostData.map((c) => c.repost)),
  }
}

export const buildUserInterestsCache = async (userId?: string) => {
  log('Starting user topic interests cache build process')
  const pg = createSupabaseDirectClient(getInstanceId())
  const activeUserIds = filterDefined([userId])

  if (Object.keys(userIdsToAverageTopicConversionScores).length === 0) {
    const recentlyActiveUserIds = await pg.map(
      `select distinct user_id from user_contract_interactions
              where created_time > now() - interval $1`,
      [DEBUG ? '10 minutes' : '1 month'],
      (r) => r.user_id as string
    )
    activeUserIds.push(...recentlyActiveUserIds)
  }
  log('building cache for users: ', activeUserIds.length)
  const chunks = chunk(activeUserIds, 500)
  for (const userIds of chunks) {
    await Promise.all([
      ...userIds.map(async (userId) => {
        userIdsToAverageTopicConversionScores[userId] = {}
        await pg.map(
          `SELECT * FROM get_user_topic_interests($1, 50) LIMIT 100`,
          [userId],
          (r) => {
            userIdsToAverageTopicConversionScores[userId][r.group_id] =
              r.avg_conversion_score
          }
        )
      }),
      addScoreForFollowedTopics(pg, userIds),
    ])
    log(
      'built topic interests cache for users: ',
      Object.keys(userIdsToAverageTopicConversionScores).length
    )
  }
  log('built user topic interests cache')
}

const addScoreForFollowedTopics = async (
  pg: SupabaseDirectClient,
  userIds: string[]
) => {
  await pg.map(
    `select member_id, group_id from group_members where member_id = any($1)`,
    [userIds],
    (row) => {
      if (!userIdsToAverageTopicConversionScores[row.member_id]) {
        userIdsToAverageTopicConversionScores[row.member_id] = {}
      }
      if (!userIdsToAverageTopicConversionScores[row.member_id][row.group_id]) {
        userIdsToAverageTopicConversionScores[row.member_id][row.group_id] = 0
      }
      userIdsToAverageTopicConversionScores[row.member_id][row.group_id] += 1
    }
  )
}
