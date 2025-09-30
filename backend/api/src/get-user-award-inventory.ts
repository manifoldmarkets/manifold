import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserAwardInventory: APIHandler<
  'get-user-award-inventory'
> = async (props, auth) => {
  const userId = auth.uid
  if (!userId) throw new APIError(401, 'You must be signed in')
  const pg = createSupabaseDirectClient()

  const purchased = await pg.oneOrNone<{
    plus: string | null
    premium: string | null
    crystal: string | null
  }>(
    `select
       coalesce(sum(case when item_id = 'award-plus' then quantity else 0 end),0) as plus,
       coalesce(sum(case when item_id = 'award-premium' then quantity else 0 end),0) as premium,
       coalesce(sum(case when item_id = 'award-crystal' then quantity else 0 end),0) as crystal
     from shop_orders where user_id = $1`,
    [userId]
  )

  const given = await pg.oneOrNone<{
    plus: string | null
    premium: string | null
    crystal: string | null
  }>(
    `select
       coalesce(sum(case when award_type = 'plus' then 1 else 0 end),0) as plus,
       coalesce(sum(case when award_type = 'premium' then 1 else 0 end),0) as premium,
       coalesce(sum(case when award_type = 'crystal' then 1 else 0 end),0) as crystal
     from comment_awards where giver_user_id = $1`,
    [userId]
  )

  const inv = {
    plus: Math.max(0, Number(purchased?.plus ?? 0) - Number(given?.plus ?? 0)),
    premium: Math.max(
      0,
      Number(purchased?.premium ?? 0) - Number(given?.premium ?? 0)
    ),
    crystal: Math.max(
      0,
      Number(purchased?.crystal ?? 0) - Number(given?.crystal ?? 0)
    ),
  }
  return inv
}

