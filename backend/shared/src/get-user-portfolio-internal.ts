import { getUser, log } from 'shared/utils'
import { APIError } from 'common/api/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { groupBy, keyBy, sumBy, uniq } from 'lodash'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'
import { computeInvestmentValue } from 'common/calculate-metrics'

export const getUserPortfolioInternal = async (userId: string) => {
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

  const { totalDeposits, spiceBalance, balance, profitAdjustment } = user
  return {
    loanTotal,
    investmentValue,
    balance,
    spiceBalance,
    totalDeposits,
    timestamp: Date.now(),
    // Not used for profit graphs, only the leaderboard
    profit:
      (profitAdjustment ?? 0) +
      spiceBalance +
      investmentValue +
      balance -
      totalDeposits,
  }
}
