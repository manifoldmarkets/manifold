import { CPMMMultiContract } from 'common/contract'
import { areGenderCompatible } from 'common/love/compatibility-util'
import { Lover, LoverRow } from 'common/love/lover'
import { Row } from 'common/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getLover = async (userId: string) => {
  const pg = createSupabaseDirectClient()
  return await pg.oneOrNone<Lover>(
    `
      select
        *, users.data as user
      from
        lovers
      join
        users on users.id = lovers.user_id
      where
        user_id = $1
    `,
    [userId]
  )
}

export const getLovers = async (userIds: string[]) => {
  const pg = createSupabaseDirectClient()
  return await pg.manyOrNone<Lover>(
    `
      select
        *, users.data as user
      from
        lovers
      join
        users on users.id = lovers.user_id
      where
        user_id = any($1)
    `,
    [userIds]
  )
}

export const getLoverContracts = async (userId: string) => {
  const pg = createSupabaseDirectClient()
  return await pg.map<CPMMMultiContract>(
    `
      select data from contracts
      where outcome_type = 'MULTIPLE_CHOICE'
      and resolution is null
      and (
        data->>'loverUserId1' = $1
        or data->>'loverUserId2' = $1
      )
    `,
    [userId],
    (r) => r.data
  )
}

export const getGenderCompatibleLovers = async (lover: LoverRow) => {
  const pg = createSupabaseDirectClient()
  const lovers = await pg.manyOrNone<Lover>(
    `
      select 
        *, users.data as user
      from lovers
      join
        users on users.id = lovers.user_id
      where
        user_id != $(user_id)
        and looking_for_matches
        and (data->>'isBannedFromPosting' != 'true' or data->>'isBannedFromPosting' is null)
        and lovers.pinned_url is not null
      `,
    { ...lover }
  )
  return lovers.filter(l => areGenderCompatible(lover, l))
}

export const getCompatibleLovers = async (
  lover: LoverRow,
  radiusKm: number | undefined
) => {
  const pg = createSupabaseDirectClient()
  return await pg.manyOrNone<Lover>(
    `
      select 
        *, users.data as user
      from lovers
      join
        users on users.id = lovers.user_id
      where
        user_id != $(user_id)
        and looking_for_matches
        and (data->>'isBannedFromPosting' != 'true' or data->>'isBannedFromPosting' is null)

        -- Gender
        and (lovers.gender = any($(pref_gender)) or lovers.gender = 'non-binary')
        and ($(gender) = any(lovers.pref_gender) or $(gender) = 'non-binary')

        -- Age
        and lovers.age >= $(pref_age_min)
        and lovers.age <= $(pref_age_max)
        and $(age) >= lovers.pref_age_min
        and $(age) <= lovers.pref_age_max

        -- Location
        and calculate_earth_distance_km($(city_latitude), $(city_longitude), lovers.city_latitude, lovers.city_longitude) < $(radiusKm)
      `,
    { ...lover, radiusKm: radiusKm ?? 40_000 }
  )
}

export const getCompatibilityAnswers = async (userIds: string[]) => {
  const pg = createSupabaseDirectClient()
  return await pg.manyOrNone<Row<'love_compatibility_answers'>>(
    `
      select * from love_compatibility_answers
      where creator_id = any($1)
    `,
    [userIds]
  )
}
