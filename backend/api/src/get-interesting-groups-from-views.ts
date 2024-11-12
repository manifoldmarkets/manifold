import type { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertGroup } from 'common/supabase/groups'

export const getInterestingGroupsFromViews: APIHandler<
  'get-interesting-groups-from-views'
> = async (props) => {
  const { userId, contractIds } = props
  const pg = createSupabaseDirectClient()
  return await pg.map(
    ` select g.*, false as has_bet
            from
              groups g
                  join group_contracts gc on g.id = gc.group_id
            where gc.contract_id = any($2)
          union
          -- This case is for if we let users bet before seeing the welcome flow
          select g.*, true as has_bet
          from
              groups g
                  join group_contracts gc on g.id = gc.group_id
                  join contract_bets cb on gc.contract_id = cb.contract_id
          where cb.user_id = $1
        `,
    [userId, contractIds],
    ({ has_bet, ...data }) => ({
      hasBet: has_bet,
      ...convertGroup(data),
    })
  )
}
