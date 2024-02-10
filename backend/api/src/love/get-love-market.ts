import { type APIHandler } from 'api/helpers/endpoint'
import { Lover } from 'common/love/lover'
import { getUserLoveMarket } from 'shared/love/love-markets'
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

    const yourMessageChannelIds = await pg.map<string>(
      `
    select distinct channel_id
    from private_user_messages
    where
      user_id = $1
    `,
      [userId],
      (r) => r.channel_id
    )

    console.log('yourMessageChannelIds', yourMessageChannelIds)

    // Get the lovers that have mutually messaged with you...
    mutuallyMessagedUserIds = await pg.map<string>(
      `
    select distinct user_id from private_user_messages
    where
      user_id = any($1) and
      channel_id = any($2)
    `,
      [answers.map((a) => a.loverUserId), yourMessageChannelIds],
      (r) => r.user_id
    )
    console.log('mutualMessages', mutuallyMessagedUserIds)
  }

  return {
    contract,
    lovers,
    mutuallyMessagedUserIds,
  }
}
