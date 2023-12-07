import { APIError, typedEndpoint } from 'api/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { CPMMMultiContract } from 'common/contract'
import { Lover, LoverRow } from 'common/love/lover'
import { getNearbyCities } from 'api/search-near-city'
import { getUsersSupabase } from 'shared/utils'

export const getCompatibleLovers = typedEndpoint(
  'compatible-lovers',
  async (props, _auth, { log }) => {
    const { userId } = props

    // const potentialLovers = lovers
    //   .filter((l) => l.user_id !== profileUserId)
    //   .filter((l) => !matchesSet.has(l.user_id))
    //   .filter((l) => l.looking_for_matches)
    //   .filter(
    //     (l) =>
    //       !lover ||
    //       (areGenderCompatible(lover, l) &&
    //         areAgeCompatible(lover, l) &&
    //         areLocationCompatible(lover, l))
    //   )

    const pg = createSupabaseDirectClient()

    const lover = await pg.oneOrNone<LoverRow>(
      `
    select * from lovers
    where user_id = $1
  `,
      [userId]
    )

    log('got lover', lover)

    if (!lover) throw new APIError(404, 'Lover not found')

    const radius = 50
    const nearbyCityIds = lover.geodb_city_id
      ? await getNearbyCities(lover.geodb_city_id, radius)
      : []

    log('got nearby cities', nearbyCityIds)

    const lovers = await pg.manyOrNone<LoverRow>(
      `
    select * from lovers
    join users on users.id = lovers.user_id
    where user_id != $1
    and data->>'isBannedFromPosting' != 'true'
    and looking_for_matches
    and lovers.gender = any($2)
    and $3 = any(lovers.pref_gender)
    and lovers.geodb_city_id = any($4)
  `,
      [userId, lover.pref_gender, lover.gender, nearbyCityIds]
    )

    log('got lovers', lovers)

    const loverContracts = await pg.map<CPMMMultiContract>(
      `select data from contracts
    where outcome_type = 'MULTIPLE_CHOICE'
    and resolution is null
    and (
      data->>'loverUserId1' = $1
      or data->>'loverUserId2' = $1
    )`,
      [userId],
      (r) => r.data
    )

    log('got lover contracts', loverContracts)

    const users = await getUsersSupabase(lovers.map((l) => l.user_id))
    const loversWithUsers = lovers
      .map((l, i) => ({
        ...l,
        user: users[i],
      }))
      .filter((l) => l.user) as Lover[]

    return { status: 'success', lovers: loversWithUsers, loverContracts }
  }
)
