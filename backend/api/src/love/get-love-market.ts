import { type APIHandler } from 'api/helpers/endpoint'
import { CPMMMultiContract } from 'common/contract'
import { Lover } from 'common/love/lover'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getLoveMarket: APIHandler<'get-love-market'> = async (props) => {
  const { userId } = props

  return {
    status: 'success',
    ...(await getLoveMarketMain(userId)),
  }
}

export const getLoveMarketMain = async (userId: string) => {
  const pg = createSupabaseDirectClient()

  const contract = await pg.oneOrNone<CPMMMultiContract>(
    `select data from contracts
    where
      creator_id = $1
      and data->>'isLove' = 'true'
      and resolution is null
    `,
    [userId],
    (r) => (r ? r.data : null)
  )
  if (!contract) {
    return {
      contract: null,
      lovers: [],
    }
  }

  const { answers } = contract

  const lovers = await pg.manyOrNone<Lover>(
    `select lovers.*, users.data as user
    from lovers
    join users on users.id = lovers.user_id
    where
      looking_for_matches = true
      and (data->>'isBannedFromPosting' != 'true' or data->>'isBannedFromPosting' is null)
      and user_id = any($1)
    `,
    [answers.map((a) => a.loverUserId)]
  )

  console.log('got contract', contract, 'and lovers', lovers)

  return {
    contract,
    lovers,
  }
}
