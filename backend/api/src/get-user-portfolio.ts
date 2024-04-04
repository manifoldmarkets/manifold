import { groupBy, keyBy, sumBy, uniq } from 'lodash'
import { getUser, log } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { computeInvestmentValue } from 'common/calculate-metrics'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'

export const getUserPortfolio: APIHandler<'get-user-portfolio'> = async (
  props
) => {
  const { userId } = props

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  const pg = createSupabaseDirectClient()
  const startTime = Date.now()

  // Based off of getMetricRelevantUserBets in update-user-metrics-core.ts
  const unresolvedBets = await pg.map(
    `select outcome, amount, shares, cb.contract_id, answer_id,
      (cb.data->>'loanAmount')::numeric as loan_amount
    from contract_bets as cb
    join contracts as c on cb.contract_id = c.id
    left join answers as a on cb.answer_id = a.id
    where
      cb.user_id = $1
      and c.resolution_time is null
      and (a is null or a.data->'resolution' is null)
      and cb.data->>'sale' is null
      and (cb.data->>'isSold' is null or cb.data->>'isSold' = 'false')
      `,
    [userId],
    (r) =>
      ({
        contractId: r.contract_id as string,
        answerId: r.answer_id as string,
        outcome: r.outcome as string,
        amount: Number(r.amount),
        shares: Number(r.shares),
        loanAmount: Number(r.loan_amount),
      } as Bet)
  )

  // Based off getRelevantContracts(pg, unresolvedBets) in update-user-metrics-core.ts
  const betContractIds = uniq(unresolvedBets.map((b) => b.contractId))
  const [contracts, answers] = await Promise.all(
    betContractIds.length === 0
      ? [[], []]
      : [
          pg.map(
            `select
      id,
      data->'pool' as pool,
      data->>'mechanism' as mechanism,
      data->'totalShares' as total_shares,
      (data->>'p')::numeric as p
    from contracts where id in ($1:list)
    `,
            [betContractIds],
            (r) =>
              ({
                id: r.id,
                pool: r.pool,
                mechanism: r.mechanism,
                p: r.p,
                totalShares: r.total_shares,
              } as any as Contract)
          ),
          pg.map(
            `select id, contract_id, prob
    from answers
    where contract_id in ($1:list)`,
            [betContractIds],
            (r) =>
              ({
                id: r.id,
                contractId: r.contract_id,
                prob: r.prob,
              } as any as Answer)
          ),
        ]
  )
  const answersByContractId = groupBy(answers, 'contractId')
  for (const contract of contracts) {
    if (contract.mechanism === 'cpmm-multi-1') {
      contract.answers = answersByContractId[contract.id]
    }
  }

  const loanTotal = sumBy(unresolvedBets, (b) => b.loanAmount ?? 0)

  const contractsById = keyBy(contracts, 'id')
  const investmentValue = computeInvestmentValue(unresolvedBets, contractsById)

  log(
    'time',
    Date.now() - startTime,
    'bets',
    unresolvedBets.length,
    'contracts',
    contracts.length,
    'answers',
    answers.length
  )

  return {
    status: 'success',
    loanTotal,
    investmentValue,
    balance: user.balance,
    totalDeposits: user.totalDeposits,
    timestamp: Date.now(),
  }
}

// Below is the start of the calculation of investment value in just sql.
// Once this works, we can stop using the computeInvestmentValue function.
// TODO(James): Add dpm share value or migrate off dpm.
// TODO(James): Figure out why this investment calculation is different from user-contract-metrics.ts.
// Could be that user_contract_metrics is not correctly summarizing contract_bets.
// const investment = await pg.one(
//   `select
//     sum(
//       case
//         when answers.prob is not null then
//           coalesce(total_shares_yes, 0) * answers.prob
//           + coalesce(total_shares_no, 0) * (1 - answers.prob)
//         else
//           coalesce(total_shares_yes, 0) * (contracts.data->>'prob')::numeric
//           + coalesce(total_shares_no, 0) * (1 - (contracts.data->>'prob')::numeric)
//       end
//     ) as total_investment_value
//   from user_contract_metrics ucm
//   join contracts on ucm.contract_id = contracts.id
//   left join answers on ucm.answer_id = answers.id
//   where
//     ucm.user_id = $1
//     and contracts.resolution is null
//     and (contracts.mechanism = 'cpmm-multi-1' or contracts.mechanism = 'cpmm-1')
//     and has_shares = true`,
//   [userId],
//   (r) => Number(r.total_investment_value)
// )

// const portfolioHistory = await pg.oneOrNone(
//   `SELECT DISTINCT ON (user_id) user_id, investment_value, loan_total, balance, total_deposits, ts
//   FROM user_portfolio_history
//   WHERE user_id = $1
//   ORDER BY user_id, ts DESC`,
//   [userId]
// )
