import { type APIHandler } from 'api/helpers/endpoint'
import { CPMMMultiContract } from 'common/contract'
import { Lover } from 'common/love/lover'
import { filterDefined } from 'common/util/array'
import { groupBy, mapValues, uniq } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getLoveMarkets: APIHandler<'get-love-markets'> = async () => {
  return {
    status: 'success',
    ...(await getLoveMarketsMain()),
  }
}

export const getLoveMarketsMain = async () => {
  const pg = createSupabaseDirectClient()

  const contracts = await pg.map<CPMMMultiContract>(
    `select data from contracts
    where
      data->>'isLove' = 'true'
      and resolution is null
    order by last_bet_time desc nulls last
    `,
    [],
    (r) => r.data
  )

  const creatorIds = contracts.map((c) => c.creatorId)
  const loverUserIds = filterDefined(
    uniq(contracts.map((c) => c.answers.map((a) => a.loverUserId)).flat())
  )

  const creatorLovers = await pg.manyOrNone<Lover>(
    `select lovers.*, users.data as user
    from lovers
    join users on users.id = lovers.user_id
    where
      looking_for_matches = true
      and (data->>'isBannedFromPosting' != 'true' or data->>'isBannedFromPosting' is null)
      and user_id = any($1)
    `,
    [creatorIds]
  )
  const lovers = await pg.manyOrNone<Lover>(
    `select lovers.*, users.data as user
    from lovers
    join users on users.id = lovers.user_id
    where
      looking_for_matches = true
      and (data->>'isBannedFromPosting' != 'true' or data->>'isBannedFromPosting' is null)
      and user_id = any($1)
    `,
    [loverUserIds]
  )

  console.log('got contracts', contracts.length, 'and lovers', lovers.length)

  const mutualMessageData = await pg.manyOrNone<{
    creator_id: string
    mutual_id: string
    channel_id: string
  }>(
    `
    SELECT
        p1.user_id AS creator_id,
        p2.user_id AS mutual_id,
        p1.channel_id
    FROM
        private_user_messages p1
    JOIN
        private_user_messages p2 ON p1.channel_id = p2.channel_id AND p1.user_id != p2.user_id
    WHERE
        p1.user_id = any($1)
    GROUP BY
        p1.user_id, p2.user_id, p1.channel_id
    `,
    [creatorIds]
  )

  const creatorMutuallyMessagedUserIds = mapValues(
    groupBy(mutualMessageData, (r) => r.creator_id),
    (v) => v.map((r) => r.mutual_id)
  )

  console.log('creatorMutuallyMessagedUserIds', creatorMutuallyMessagedUserIds)

  return {
    contracts,
    creatorLovers,
    lovers,
    creatorMutuallyMessagedUserIds,
  }
}
