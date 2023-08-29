import { pgp, SupabaseDirectClient } from 'shared/supabase/init'
import { fromPairs } from 'lodash'
import { FEED_REASON_TYPES, INTEREST_DISTANCE_THRESHOLDS } from 'common/feed'
import { Row } from 'common/supabase/utils'
import { log } from 'shared/utils'
import { ITask } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { WEEK_MS } from 'common/util/time'

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
  return fromPairs(
    userIdsAndDistances.map((r) => [
      r.user_id,
      'similar_interest_vector_to_news_vector' as FEED_REASON_TYPES,
    ])
  )
}

export const spiceUpNewUsersFeedBasedOnTheirInterests = async (
  userId: string,
  pg: SupabaseDirectClient,
  userIdFeedSource: string,
  limit: number
) => {
  await pg.tx(async (t) => {
    const relatedFeedItems = await t.manyOrNone<Row<'user_feed'>>(
      `              
          WITH user_embedding AS (
            SELECT interest_embedding
            FROM user_embeddings
            WHERE user_id = $1
          ),
         recent_feed as (
             SELECT distinct on (contract_id) * FROM user_feed
             where created_time > now() - interval '14 days'
               and user_id = $2
         ),
         feed_embeddings AS (
             SELECT contract_embeddings.contract_id, embedding
             FROM contract_embeddings
              JOIN recent_feed
              ON contract_embeddings.contract_id = recent_feed.contract_id
         ),
         feed_ordered_by_distance AS (
             SELECT recent_feed.*
             FROM feed_embeddings,user_embedding,recent_feed
             WHERE feed_embeddings.contract_id = recent_feed.contract_id
             order by (feed_embeddings.embedding <=> user_embedding.interest_embedding)
             limit $3
         )
          SELECT *
          FROM feed_ordered_by_distance
        `,
      [userId, userIdFeedSource, limit]
    )
    log('found relatedFeedItems', relatedFeedItems.length)

    return copyOverFeedItems(userId, relatedFeedItems, t)
  })
}

type userFeedRowAndDistance = Row<'user_feed'> & { distance?: number }
const copyOverFeedItems = async (
  userId: string,
  relatedFeedItems: userFeedRowAndDistance[],
  pg: ITask<IClient> & IClient
) => {
  if (relatedFeedItems.length === 0) return []
  const now = Date.now()
  const updatedRows = relatedFeedItems.map((row, i) => {
    // assuming you want to change the 'columnToChange' column
    const { id: __, distance: _, ...newRow } = row
    newRow.user_id = userId
    newRow.is_copied = true
    newRow.created_time = new Date(now - i * 100).toISOString()
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
