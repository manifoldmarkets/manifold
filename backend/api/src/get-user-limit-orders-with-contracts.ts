import type { APIHandler } from 'api/helpers/endpoint'
import { LimitBet } from 'common/bet'
import { MarketContract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'

export const getUserLimitOrdersWithContracts: APIHandler<
  'get-user-limit-orders-with-contracts'
> = async (props) => {
  const { count, userId, includeExpired, includeCancelled, includeFilled } =
    props
  const pg = createSupabaseDirectClient()
  const contracts = [] as MarketContract[]
  const bets = [] as LimitBet[]
  await pg.map(
    `
    select contract_id, bets.data as bets, contracts.data as contracts
    from (
    select contract_id,
      array_agg(
        jsonb_set(data::jsonb, '{updated_time}', to_jsonb(updated_time))
        order by created_time desc
      ) as data
    from contract_bets
    where user_id = $1
      and ( 
             ($3 and contract_bets.expires_at < now()) or 
             (not $3 and (contract_bets.expires_at > now() or contract_bets.expires_at is null)) 
      )
      and ( 
            ($4 and contract_bets.is_filled = true)
            or (not $4 and contract_bets.is_filled = false)
      )
      and (
            (($5 or $3) and contract_bets.is_cancelled = true)
            or (not $5 and contract_bets.is_cancelled = false)
      )
      and not is_redemption
      and data->>'limitProb' is not null
      and (data->>'silent' = 'false' or data->>'silent' is null)
    group by contract_id
  ) as bets
  join contracts on contracts.id = bets.contract_id
  limit $2
  `,
    [userId, count, includeExpired, includeFilled, includeCancelled],
    (r) => {
      bets.push(...(r.bets.map(convertBet) as LimitBet[]))
      contracts.push(r.contracts as MarketContract)
    }
  )

  return { bets, contracts }
}
