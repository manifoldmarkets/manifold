import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { PrivateUser } from 'common/user'
import { orderBy, uniqBy } from 'lodash'
import {
  from,
  renderSql,
  select,
  join,
  limit as lim,
  where,
  orderBy as order,
} from 'shared/supabase/sql-builder'
import { buildArray } from 'common/util/array'
import { log } from 'shared/utils'

export const getFeed: APIHandler<'get-feed'> = async (props) => {
  const { limit, offset, userId, ignoreContractIds } = props
  // const userId = 'tlmGNz9kjXc2EteizMORes4qvWl2'
  const pg = createSupabaseDirectClient()
  // TODO:
  // at least get reposts from users that the user follows
  // maybe also popular reposts in groups that the user is interested in
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

  const baseQueryArray = buildArray(
    select(`contracts.*, uti.avg_conversion_score as topic_conversion_score`),
    from(`get_user_topic_interests('${userId}', 50) as uti`),
    join(`groups on groups.id = uti.group_id`),
    join(`group_contracts on group_contracts.group_id = uti.group_id`),
    join(`contracts on contracts.id = group_contracts.contract_id`),
    where(`contracts.close_time > now()`),
    where(
      `contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)`,
      [userId]
    ),
    where(
      `not exists (select 1 from user_contract_views where user_contract_views.user_id = $1 and user_contract_views.contract_id = contracts.id)`,
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
    order(`uti.avg_conversion_score  * contracts.conversion_score DESC`)
  )
  const sorts = {
    conversion: `uti.avg_conversion_score  * contracts.conversion_score DESC`,
    importance: `uti.avg_conversion_score  * contracts.importance_score DESC`,
    freshness: `uti.avg_conversion_score  * contracts.freshness_score DESC`,
  }
  const sortQueries = Object.values(sorts).map((orderQ) =>
    renderSql(...baseQueryArray, order(orderQ))
  )
  const startTime = Date.now()
  const [
    convertingContracts,
    importantContracts,
    freshContracts,
    followedContracts,
  ] = await Promise.all([
    ...sortQueries.map((sortQuery) =>
      pg.map(sortQuery, [], (r) => ({
        contract: convertContract(r),
        topicConversionScore: r.topic_conversion_score as number,
      }))
    ),
    pg.map(followedQuery, [], (r) => ({
      contract: convertContract(r),
      topicConversionScore: r.topic_conversion_score as number,
    })),
  ])
  log('getFeed completed in (s):', (Date.now() - startTime) / 1000, {
    userId,
    ignoreContractIds: ignoreContractIds?.length,
  })

  const contracts = uniqBy(
    orderBy(
      convertingContracts.concat(
        importantContracts,
        freshContracts,
        followedContracts
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
    comments: [],
  }
}
