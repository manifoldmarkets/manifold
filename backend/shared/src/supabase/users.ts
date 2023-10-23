import { pgp, SupabaseDirectClient } from 'shared/supabase/init'
import { fromPairs } from 'lodash'
import {
  FEED_REASON_TYPES,
  getRelevanceScore,
  INTEREST_DISTANCE_THRESHOLDS,
  NEW_USER_FEED_DATA_TYPES,
} from 'common/feed'
import { Row } from 'common/supabase/utils'
import { log } from 'shared/utils'
import { ITask } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { MINUTE_MS, WEEK_MS } from 'common/util/time'
import { getContractsDirect } from 'shared/supabase/contracts'
import { createManualTrendingFeedRow } from 'shared/create-feed'
import { removeUndefinedProps } from 'common/util/object'

export const getUserFollowerIds = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userFollowerIds = await pg.manyOrNone<{ user_id: string }>(
    `select user_id from user_follows where follow_id = $1`,
    [userId]
  )
  return userFollowerIds.map((r) => r.user_id)
}

export const getUsersWithSimilarInterestVectorToNews = async (
  newsId: string,
  averageImportanceScore: number,
  pg: SupabaseDirectClient
) => {
  const userIdsAndDistances = await pg.manyOrNone<{
    user_id: string
    distance: number
  }>(
    // The indices don't work great (returns ~half the users) for far out of sample vectors, running a seq
    // scan instead by omitting the order by clause.
    `
    with ce as (
        select title_embedding
        from news
        where news.id = $1
    )
    select user_id, distance
    from (
             select ue.user_id, (select title_embedding from ce) <=> ue.interest_embedding as distance
             from user_embeddings as ue
         ) as distances
    where distance < $2
  `,
    [newsId, INTEREST_DISTANCE_THRESHOLDS.news_with_related_contracts]
  )
  const reasons = [
    'similar_interest_vector_to_news_vector',
  ] as FEED_REASON_TYPES[]

  return fromPairs(
    userIdsAndDistances.map((r) => [
      r.user_id,
      {
        reasons,
        relevanceScore: getRelevanceScore(
          'news_with_related_contracts',
          reasons,
          averageImportanceScore,
          r.distance
        ),
      },
    ])
  )
}

export const generateNewUserFeedFromContracts = async (
  userId: string,
  pg: SupabaseDirectClient,
  userIdFeedSource: string,
  targetContractIds: string[],
  estimatedRelevance: number
) => {
  await pg.tx(async (t) => {
    const relatedFeedItems = await t.map(
      `              
          WITH recent_feed as (
             SELECT distinct on (contract_id) * FROM user_feed
             where created_time > now() - interval '14 days'
               and user_id = $2
               and data_type = any($4::text[])
               and contract_id = any($5::text[])
         ), feed_contracts AS (
              SELECT importance_score
              FROM contracts
              JOIN recent_feed
                ON contracts.id = recent_feed.contract_id
          )
          SELECT recent_feed.*, feed_contracts.importance_score as importance_score
          FROM recent_feed, feed_contracts
          order by feed_contracts.importance_score desc
          limit $3
        `,
      [
        userId,
        userIdFeedSource,
        targetContractIds.length,
        NEW_USER_FEED_DATA_TYPES,
        targetContractIds,
      ],
      (r: Row<'user_feed'> & { importance_score: number }) =>
        removeUndefinedProps({
          ...r,
          relevance_score: r.importance_score * estimatedRelevance,
          importance_score: undefined, // remove this column
        })
    )
    log('found related feed items', relatedFeedItems.length, 'for user', userId)
    await copyOverFeedItems(userId, relatedFeedItems, t)
    const foundContractIds = relatedFeedItems.map((r) => r.contract_id)
    const missingContractIds = targetContractIds.filter(
      (cid) => !foundContractIds.includes(cid)
    )
    const manualContracts = await getContractsDirect(missingContractIds, pg)
    const manualFeedRows = createManualTrendingFeedRow(
      manualContracts,
      userId,
      estimatedRelevance
    )
    log('made manual feed rows', manualFeedRows.length, 'for user', userId)
    await copyOverFeedItems(userId, manualFeedRows, t, MINUTE_MS)
  })
}

const copyOverFeedItems = async (
  userId: string,
  relatedFeedItems: Row<'user_feed'>[],
  pg: ITask<IClient> & IClient,
  timeOffset?: number
) => {
  if (relatedFeedItems.length === 0) return []
  const now = Date.now()
  const updatedRows = relatedFeedItems.map((row, i) => {
    // assuming you want to change the 'columnToChange' column
    const { id: __, ...newRow } = row
    newRow.user_id = userId
    newRow.is_copied = true
    newRow.created_time = new Date(
      now - i * 100 - (timeOffset ?? 0)
    ).toISOString()
    return newRow
  })
  const cs = new pgp.helpers.ColumnSet(updatedRows[0], { table: 'user_feed' })
  const insert = pgp.helpers.insert(updatedRows, cs) + ' ON CONFLICT DO NOTHING'

  try {
    await pg.none(insert)
  } catch (e) {
    console.log('error inserting feed items')
    console.error(e)
  }

  return relatedFeedItems
}

export const getWhenToIgnoreUsersTime = () => {
  // Always get the same time a month ago today so postgres can cache the query
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return today.getTime() - 3 * WEEK_MS
}
