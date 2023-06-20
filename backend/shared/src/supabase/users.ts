import { SupabaseDirectClient } from 'shared/supabase/init'
import { fromPairs } from 'lodash'
import {
  FEED_REASON_TYPES,
  INTEREST_DISTANCE_THRESHOLDS,
  USER_TO_USER_DISTANCE_THRESHOLD,
} from 'common/feed'
import { Row } from 'common/supabase/utils'
import { log } from 'shared/utils'

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

export const getUsersWithSimilarInterestVectorToUser = async (
  userId: string,
  pg: SupabaseDirectClient,
  // -- user id used: AJwLWoo3xue32XIiAVrL5SyR1WB2, distance: .01
  // -- probes at 5: 861 rows, 240 ms
  // -- probes at 3: 814 rows, 115 ms
  // -- probes at 1: 215 rows, 30ms
  // Probably don't need more than 5
  probes = 3
) => {
  const userIdsAndDistances = await pg.tx(async (t) => {
    await t.none('SET LOCAL ivfflat.probes = $1', [probes])
    const res = await t.manyOrNone<{
      user_id: string
      distance: number
    }>(
      `
    with pe as (select interest_embedding
                 from user_embeddings
                 where user_id = $1)
   select user_id, distance
   from (
            select ue.user_id, (select interest_embedding from pe) <=> ue.interest_embedding as distance
            from user_embeddings as ue
        ) as distances
   where distance < $2
   order by distance
   limit 1000
  `,
      [userId, USER_TO_USER_DISTANCE_THRESHOLD]
    )
    return res
  })

  return userIdsAndDistances.map((r) => r.user_id).filter((id) => id !== userId)
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
    limit 10000;
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

export const populateNewUsersFeedFromEmbeddings = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  await pg.tx(async (t) => {
    await t.none('SET LOCAL ivfflat.probes = $1', [20])
    const similarUsersWithFeedItems = await t.manyOrNone<{
      user_id: string
      feed_count: number
      distance: number
    }>(
      `
          WITH ordered_users AS (
              SELECT user_embeddings.user_id,
                     (user_embeddings.interest_embedding <=> (
                         SELECT interest_embedding
                         FROM user_embeddings
                         WHERE user_id = $1
                     )) AS distance
              FROM user_embeddings
              WHERE user_id != $1 AND
                      (user_embeddings.interest_embedding <=> (
                          SELECT interest_embedding
                          FROM user_embeddings
                          WHERE user_id = $1
                      )) < $2
              ORDER BY distance
              LIMIT 100
          ),
           ordered_users_with_feed_counts AS (
               SELECT ordered_users.user_id,
                      COUNT(DISTINCT user_feed.contract_id) AS feed_count,
                      ordered_users.distance
               FROM ordered_users
                        LEFT JOIN user_feed ON ordered_users.user_id = user_feed.user_id
               where user_feed.created_time > now() - interval '5 days'
               GROUP BY ordered_users.user_id, ordered_users.distance
               HAVING COUNT(DISTINCT user_feed.contract_id) > 30
               )
          SELECT *
          FROM ordered_users_with_feed_counts
          ORDER BY distance;
      `,
      [userId, USER_TO_USER_DISTANCE_THRESHOLD]
    )
    const similarUsers = similarUsersWithFeedItems.length > 0
    if (similarUsers) {
      log(
        'found similar user with feed items:',
        similarUsersWithFeedItems[0].user_id,
        'to user',
        userId
      )
    }
    const similarUsersFeedItems = !similarUsers
      ? await t.many<Row<'user_feed'>>(
          `
              WITH user_embedding AS (
                  SELECT interest_embedding
                  FROM user_embeddings
                  WHERE user_id = $1
              ),
               interesting_contracts AS (
                   SELECT contract_id,
                          (SELECT interest_embedding FROM user_embedding) <=> embedding AS distance
                   FROM contract_embeddings
                   ORDER BY distance
                   LIMIT 50
               ),
               interesting_contracts_ordered AS (
                   SELECT interesting_contracts.contract_id,
                          ((data->'lastUpdatedTime')::numeric) AS last_updated_time
                   FROM interesting_contracts
                            JOIN contracts ON contracts.id = interesting_contracts.contract_id
                   ORDER BY last_updated_time DESC
               ),
               filtered_user_feed AS (
                   SELECT *
                   FROM user_feed
                   WHERE contract_id IN (SELECT contract_id FROM interesting_contracts_ordered)
                   and created_time > now() - interval '5 days'
               )
              SELECT DISTINCT ON (contract_id) *
              FROM filtered_user_feed
              ORDER BY contract_id, created_time DESC;
          `,
          [userId]
        )
      : await t.many<Row<'user_feed'>>(
          `
         SELECT *
         FROM user_feed
         WHERE user_id = $1
         ORDER BY created_time DESC
         LIMIT 200
             `,
          [similarUsersWithFeedItems[0].user_id]
        )
    log('found', similarUsersFeedItems.length, 'feed items to copy')

    const updatedRows = similarUsersFeedItems.map((row) => {
      // assuming you want to change the 'columnToChange' column
      const { id: __, ...newRow } = row
      newRow.user_id = userId
      newRow.is_copied = true
      return newRow
    })
    await Promise.all(
      updatedRows.map(async (row) => {
        const keys = Object.keys(row)
        const values = Object.values(row)

        const placeholders = keys.map((_, i) => `$${i + 1}`).join(',')
        try {
          await pg.none(
            `INSERT INTO user_feed (${keys.join(
              ','
            )}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            values
          )
        } catch (e) {
          console.log('error inserting feed item', row)
          console.error(e)
        }
      })
    )
    return similarUsersFeedItems
  })
}
