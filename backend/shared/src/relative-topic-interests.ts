import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { sum } from 'lodash'

export async function calculateRelativeTopicInterests() {
  const pg = createSupabaseDirectClient()
  // get users who viewed a contract in the past day
  const activeUserIds = await pg.map(
    `select distinct user_id from user_contract_views
          where (last_card_view_ts > now() - interval '1 day'
          or last_page_view_ts > now() - interval '1 day'
          or last_promoted_view_ts > now() - interval '1 day'
              )and user_id ='AJwLWoo3xue32XIiAVrL5SyR1WB2'`,
    [],
    (row) => row.user_id
  )
  // get the topics of the contract pages they viewed
  const viewedTopicIds = await pg.map(
    `select user_id, array_agg(group_id) as viewed_group_ids
                from user_contract_views ucv
              join group_contracts gc on gc.contract_id = ucv.contract_id
             where user_id = any($1)
             and last_page_view_ts > now() - interval '1 day'
             group by user_id
          `,
    [activeUserIds],
    (row) => ({
      userId: row.user_id,
      viewedGroupIds: row.viewed_group_ids as string[],
    })
  )
  const enjoymentActivityNames = [
    'page bet',
    'page like',
    'page repost',
    'page comment',
    'card bet',
    'card like',
  ]
  // get the topics of the contracts they enjoyed
  const enjoyedTopicIds = await pg.map(
    `select user_id, array_agg(group_id) as enjoyed_group_ids
                from user_contract_interactions uci
              join group_contracts gc on gc.contract_id = uci.contract_id
             where user_id = any($1)
               and name = any($2)
             and created_time > now() - interval '1 day'
             group by user_id
          `,
    [activeUserIds, enjoymentActivityNames],
    (row) => ({
      userId: row.user_id,
      enjoyedGroupIds: row.enjoyed_group_ids as string[],
    })
  )
  // bets,likes, etc. get 1 point, views get 0.5 point. add the topics points up per user per topic
  const userIdsToInterests: {
    [userId: string]: {
      [groupId: string]: number
    }
  } = {}

  for (const { userId, viewedGroupIds } of viewedTopicIds) {
    if (!userIdsToInterests[userId]) userIdsToInterests[userId] = {}
    for (const groupId of viewedGroupIds) {
      userIdsToInterests[userId][groupId] =
        (userIdsToInterests[userId][groupId] ?? 0) + 0.5
    }
  }

  for (const { userId, enjoyedGroupIds } of enjoyedTopicIds) {
    if (!userIdsToInterests[userId]) userIdsToInterests[userId] = {}
    for (const groupId of enjoyedGroupIds) {
      userIdsToInterests[userId][groupId] =
        (userIdsToInterests[userId][groupId] ?? 0) + 1
    }
  }

  // normalize the weights per user
  for (const userId in userIdsToInterests) {
    const interests = userIdsToInterests[userId]
    const totalWeight = sum(Object.values(interests))
    for (const groupId in interests) {
      interests[groupId] /= totalWeight
    }
  }
  log('Done.')
}
