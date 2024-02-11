import { type APIHandler } from 'api/helpers/endpoint'
import { CPMMMultiContract } from 'common/contract'
import { Lover } from 'common/love/lover'
import { filterDefined } from 'common/util/array'
import { uniq } from 'lodash'
import { getCreatorMutuallyMessagedUserIds } from 'shared/love/love-markets'
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
    order by importance_score desc nulls last
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

  const creatorMutuallyMessagedUserIds =
    await getCreatorMutuallyMessagedUserIds(creatorIds)

  console.log('creatorMutuallyMessagedUserIds', creatorMutuallyMessagedUserIds)

  return {
    contracts,
    creatorLovers,
    lovers,
    creatorMutuallyMessagedUserIds,
  }
}
