import { getUser } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserPortfolio: APIHandler<'get-user-portfolio'> = async (
  props
) => {
  const { userId } = props

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  const pg = createSupabaseDirectClient()

  const loanTotal = await pg.one(
    `select
      sum((contract_bets.data->>'loanAmount')::numeric) as loan_total
    from contract_bets
    join contracts on contract_bets.contract_id = contracts.id
    where
      user_id = $1
      and contracts.resolution_time is null
      and contract_bets.data->>'loanAmount' is not null
      and contract_bets.data->>'sale' is null
      and (contract_bets.data->>'isSold' is null or contract_bets.data->>'isSold' = 'false')
      `,
    [userId],
    (r) => Number(r.loan_total)
  )
  console.log('loan total', loanTotal)

  // TODO(James): Add dpm share value or migrate off dpm.
  // TODO(James): Figure out why this investment calculation is different from user-contract-metrics.ts.
  // Could be that user_contract_metrics is not correctly summarizing contract_bets.
  const investment = await pg.one(
    `select
      sum(
        case
          when answers.prob is not null then
            coalesce(total_shares_yes, 0) * answers.prob
            + coalesce(total_shares_no, 0) * (1 - answers.prob)
          else
            coalesce(total_shares_yes, 0) * (contracts.data->>'prob')::numeric
            + coalesce(total_shares_no, 0) * (1 - (contracts.data->>'prob')::numeric)
        end
      ) as total_investment_value
    from user_contract_metrics ucm
    join contracts on ucm.contract_id = contracts.id
    left join answers on ucm.answer_id = answers.id
    where
      ucm.user_id = $1
      and contracts.resolution is null
      and (contracts.mechanism = 'cpmm-multi-1' or contracts.mechanism = 'cpmm-1')
      and has_shares = true`,
    [userId],
    (r) => Number(r.total_investment_value)
  )

  return {
    status: 'success',
    loanTotal,
    investment,
    balance: user.balance,
    totalDeposits: user.totalDeposits,
  }
}
