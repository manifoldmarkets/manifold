import { type APIHandler } from 'api/helpers/endpoint'
import { Lover } from 'common/love/lover'
import {
  getMutuallyMessagedUserIds,
  getUserLoveMarket,
} from 'shared/love/love-markets'
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

  const contract = await getUserLoveMarket(userId)

  let lovers: Lover[] = []
  let mutuallyMessagedUserIds: string[] = []

  if (contract) {
    const { answers } = contract

    lovers = await pg.manyOrNone<Lover>(
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

    mutuallyMessagedUserIds = await getMutuallyMessagedUserIds(userId)
  }

  return {
    contract,
    lovers,
    mutuallyMessagedUserIds,
  }
}
