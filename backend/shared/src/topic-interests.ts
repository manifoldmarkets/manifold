import { log } from 'shared/monitoring/log'
import { metrics } from 'shared/monitoring/metrics'
import { cacheMGetJson, cacheSetManyJson } from 'shared/redis/cache'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { chunk } from 'lodash'
import { FOLLOWED_TOPIC_CONVERSION_PRIOR } from 'common/feed'
import {
  from,
  join,
  orderBy as order,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { GROUP_SLUGS_TO_NOT_INTRODUCE_IN_FEED } from 'common/envs/constants'
import { HOUR_MS } from 'common/util/time'
import { buildArray } from 'common/util/array'
import {
  NEW_USER_FOLLOWED_TOPIC_SCORE_BOOST,
  OLD_USER_FOLLOWED_TOPIC_SCORE_BOOST,
} from 'common/feed'

export type TopicToInterestWeights = { [groupId: string]: number }
export const userIdsToAverageTopicConversionScores: {
  [userId: string]: TopicToInterestWeights
} = {}

export const activeTopics: { [topicId: string]: number } = {}
let lastRefreshTime = 0

// How long a user's topic-interest scores live in Redis. They change slowly, so
// a long ttl maximises the chance a redeploy finds a warm value; the worst case
// is slightly-stale feed ranking, which is low-risk.
const USER_INTERESTS_CACHE_TTL_S = 6 * 60 * 60
const userInterestsCacheKey = (userId: string) => `user-interests:${userId}`

export const buildUserInterestsCache = async (userIds: string[]) => {
  log('Starting user topic interests cache build process')
  const pg = createSupabaseDirectClient()

  // Already warm in this process's memory (L1) — nothing to do for those.
  const missingUserIds = userIds.filter(
    (uid) =>
      !Object.keys(userIdsToAverageTopicConversionScores[uid] ?? {}).length
  )
  if (missingUserIds.length === 0) return

  // Keep activeTopics warm whenever there are users to (re)hydrate — even if
  // Redis ends up serving all of them below. Several feed endpoints read
  // activeTopics directly, and it used to be populated only as a side effect of
  // the db build path; without this a fully cache-warm process would never load
  // it. (refreshActiveTopics self-gates to ~hourly via lastRefreshTime.)
  if (Object.keys(activeTopics).length === 0) await refreshActiveTopics(pg)
  // Refresh the cache, and use the old one in the meantime
  if (lastRefreshTime < Date.now() - HOUR_MS) refreshActiveTopics(pg)
  const topicIdsMeetingMinimumBar = Object.keys(activeTopics)

  // L2: try the shared Redis cache before touching the db. On a redeploy this
  // lets a freshly started process repopulate from a sibling/previous process's
  // work instead of re-running the per-user topic-interest queries (the burst
  // that 4 processes x every deploy would otherwise put on the db).
  const cached = await cacheMGetJson<TopicToInterestWeights>(
    missingUserIds.map(userInterestsCacheKey)
  )
  const userIdsToBuild: string[] = []
  missingUserIds.forEach((userId, i) => {
    const scores = cached[i]
    if (scores && Object.keys(scores).length > 0) {
      userIdsToAverageTopicConversionScores[userId] = scores
      metrics.inc('cache/hits', { cache: 'user-interests' })
    } else {
      userIdsToBuild.push(userId)
      metrics.inc('cache/misses', { cache: 'user-interests' })
    }
  })
  if (userIdsToBuild.length === 0) return

  log('building cache for users: ', userIdsToBuild.length)

  const chunks = chunk(userIdsToBuild, 25)
  for (const chunkUserIds of chunks) {
    await Promise.all(
      chunkUserIds.map(async (userId) => {
        const results = await pg.multi(
          `
        select group_id from group_members where member_id = $1;

        with user_blocked_slugs as (
          select pu.id,jsonb_array_elements_text(pu.data->'blockedGroupSlugs') as slug
          from private_users pu
          where pu.id = $1
        )
        select distinct g.id as blocked_group_ids
        from user_blocked_slugs ubs
        join groups g on g.slug = ubs.slug;

        select distinct uti.*
        from get_user_topic_interests_2($1) as uti
        where uti.group_id in ($2:list)
        order by uti.score desc;
      `,
          [userId, topicIdsMeetingMinimumBar]
        )
        const followedTopics = results[0].map((row) => row.group_id)
        const blockedTopics = results[1].map((row) => row.blocked_group_ids)
        userIdsToAverageTopicConversionScores[userId] = {}
        results[2].forEach((r) => {
          userIdsToAverageTopicConversionScores[userId][r.group_id] = r.score
        })

        for (const groupId of followedTopics) {
          const hasFewInterests =
            Object.keys(userIdsToAverageTopicConversionScores[userId]).length <=
            25
          const groupScore =
            userIdsToAverageTopicConversionScores[userId][groupId]
          if (groupScore === undefined) {
            userIdsToAverageTopicConversionScores[userId][groupId] =
              FOLLOWED_TOPIC_CONVERSION_PRIOR
          } else {
            userIdsToAverageTopicConversionScores[userId][groupId] = Math.min(
              groupScore +
                FOLLOWED_TOPIC_CONVERSION_PRIOR *
                  (hasFewInterests
                    ? NEW_USER_FOLLOWED_TOPIC_SCORE_BOOST
                    : OLD_USER_FOLLOWED_TOPIC_SCORE_BOOST),
              1
            )
          }
        }
        for (const groupId of blockedTopics) {
          userIdsToAverageTopicConversionScores[userId][groupId] = 0
        }
      })
    )

    // Write this chunk back to the shared cache so siblings and post-redeploy
    // processes can skip the db. Done per-chunk so partial progress is cached
    // even if a later chunk fails. Best-effort: never blocks on Redis errors.
    await cacheSetManyJson(
      chunkUserIds.map((userId) => ({
        key: userInterestsCacheKey(userId),
        value: userIdsToAverageTopicConversionScores[userId],
      })),
      USER_INTERESTS_CACHE_TTL_S
    )

    log(
      'built topic interests cache for users: ',
      Object.keys(userIdsToAverageTopicConversionScores).length
    )
  }
  log('built user topic interests cache')
}

export const minimumContractsQualityBarWhereClauses = () =>
  buildArray(
    where(`contracts.close_time > now()`),
    where(`contracts.outcome_type != 'STONK'`),
    where(`contracts.outcome_type != 'BOUNTIED_QUESTION'`),
    where(`contracts.visibility = 'public'`),
    where(`contracts.unique_bettor_count > 1`)
  )

const contractsMeetingMinimumBar = renderSql(
  select('1'),
  from('contracts'),
  where('group_contracts.contract_id = contracts.id'),
  where(`coalesce(contracts.data->'isRanked', 'true')::boolean = true`),
  ...minimumContractsQualityBarWhereClauses()
)

export const minimumTopicsQualityBarClauses = [
  select('distinct id, importance_score as topic_score'),
  from('groups'),
  join('group_contracts on group_contracts.group_id = groups.id'),
  where(`exists (${contractsMeetingMinimumBar})`),
  where(`groups.slug not in ($1:list)`, [GROUP_SLUGS_TO_NOT_INTRODUCE_IN_FEED]),
  order(`topic_score desc`),
]

const refreshActiveTopics = async (pg: SupabaseDirectClient) => {
  lastRefreshTime = Date.now()
  log('refreshing active topics')
  await pg.map(renderSql(minimumTopicsQualityBarClauses), [], (r) => {
    activeTopics[r.id] = r.topic_score
  })
}
