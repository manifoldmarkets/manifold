import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { chunk } from 'lodash'
import { log } from 'shared/utils'
import { DAY_MS } from 'common/util/time'
import { millisToTs } from 'common/supabase/utils'
import { updateUserPortfolioHistoriesCore } from './update-user-portfolio-histories-core'

export const recalculateAllUserPortfolios = async (
  pg: SupabaseDirectClient
) => {
  const allUserIdsWithInvestments = await pg.map(
    `
        select distinct u.id from users u
         join user_contract_metrics ucm on u.id = ucm.user_id
         join contracts c on ucm.contract_id = c.id
        where u.data->'lastBetTime' is not null
        and c.resolution_time is null;
    `,
    [],
    (r) => r.id as string
  )
  const chunks = chunk(allUserIdsWithInvestments, 500)
  let processed = 0
  const attemptsPerChunk: number[] = new Array(chunks.length).fill(0)
  const skippedChunks: number[] = []

  for (let i = 0; i < chunks.length; i++) {
    const userIds = chunks[i]
    let success = false
    let attempts = 0
    const maxAttemptsPerChunk = 3

    while (!success && attempts < maxAttemptsPerChunk) {
      try {
        await updateUserPortfolioHistoriesCore(userIds)
        success = true
        processed += userIds.length
        attemptsPerChunk[i] = attempts + 1
        log(
          `Processed chunk ${i + 1}/${chunks.length} (${processed} of ${
            allUserIdsWithInvestments.length
          } users) in ${attempts + 1} attempts`
        )
      } catch (error: any) {
        attempts++
        if (attempts === maxAttemptsPerChunk) {
          attemptsPerChunk[i] = attempts
          skippedChunks.push(i)
          log(
            `Skipping chunk ${i + 1}/${
              chunks.length
            } after ${maxAttemptsPerChunk} failed attempts. Error: ${
              error.message
            }`
          )
          break // Skip to next chunk
        }
        log(
          `Chunk ${i + 1}/${
            chunks.length
          }: Attempt ${attempts} failed, retrying... Error: ${error.message}`
        )
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts))
      }
    }
  }

  const totalAttempts = attemptsPerChunk.reduce(
    (sum, attempts) => sum + attempts,
    0
  )
  const avgAttempts = totalAttempts / chunks.length
  log(
    `Completed processing. Results:\n` +
      `- Processed ${processed} of ${allUserIdsWithInvestments.length} users\n` +
      `- Average attempts per chunk: ${avgAttempts.toFixed(2)}\n` +
      `- Skipped chunks: ${skippedChunks.length} (${(
        (skippedChunks.length / chunks.length) *
        100
      ).toFixed(1)}%)`
  )
  if (skippedChunks.length > 0) {
    log(`Skipped chunk numbers: ${skippedChunks.map((i) => i + 1).join(', ')}`)
  }
}

// note this is missing amm liquidity
export const getManaSupplyEachDayBetweeen = async (
  pg: SupabaseDirectClient,
  startDate: number,
  numberOfDays: number
) => {
  const results = []

  for (let day = 0; day < numberOfDays; day++) {
    const start = startDate + day * DAY_MS
    const end = start + DAY_MS

    const filter = `filter (where (balance + spice_balance + investment_value > 0))`

    // claude generated - takes advantage of users table being much smaller than user_portfolio_history
    // this isn't strictly the same as getManaSupply since that uses the real user balances and gets the AMM liquidity. don't backfill more than you must.
    const userPortfolio = await pg.one(
      `with last_history as (
        select uph.* from
        users u left join lateral (
          select *
          from user_portfolio_history
          where user_id = u.id and ts <= millis_to_ts($1)
          order by ts desc
          limit 1
        ) uph on true
      )
      select
        sum(balance) as full_mana_balance
        sum(balance) ${filter} as mana_balance,
        sum(spice_balance) as full_spice_balance,
        sum(spice_balance) ${filter} as spice_balance,
        sum(cash_balance) as full_cash_balance,
        sum(cash_balance) ${filter} as cash_balance,
        sum(investment_value) as full_mana_investment_value,
        sum(investment_value) ${filter} as mana_investment_value,
        sum(cash_investment_value) as cash_investment_value,
        sum(loan_total) as full_loan_total,
        sum(loan_total) ${filter} as loan_total
      from last_history
      where balance + spice_balance + investment_value > 0;
      `,
      [end],
      (r: any) => ({
        day: millisToTs(start),
        fullTotalManaValue:
          r.full_mana_balance +
          r.full_spice_balance +
          r.full_mana_investment_value,
        totalManaValue:
          r.mana_balance + r.spice_balance + r.mana_investment_value,
        totalCashValue: r.cash_balance + r.cash_investment_value,
        fullManaBalance: r.full_mana_balance,
        manaBalance: r.mana_balance,
        fullSpiceBalance: r.full_spice_balance,
        spiceBalance: r.spice_balance,
        fullCashBalance: r.full_cash_balance,
        cashBalance: r.cash_balance,
        fullManaInvestmentValue: r.full_mana_investment_value,
        manaInvestmentValue: r.mana_investment_value,
        cashInvestmentValue: r.cash_investment_value,
        fullLoanTotal: r.full_loan_total,
        loanTotal: r.loan_total,
      })
    )
    results.push(userPortfolio)
    console.log('fetched results for ', millisToTs(start))
  }
  return results
}

export const getManaSupply = async (pg: SupabaseDirectClient) => {
  const positiveFilter = `filter (where (u.balance + u.spice_balance + uphl.investment_value) > 0.0)`

  const userPortfolio = await pg.one(
    `select
      sum(u.balance + u.spice_balance + uphl.investment_value) as full_total_mana_value,
      sum(greatest(0, u.balance + u.spice_balance + uphl.investment_value)) as total_mana_value,
      sum(u.cash_balance + uphl.cash_investment_value) as total_cash_value,
      sum(u.balance) as full_mana_balance,
      sum(u.balance) ${positiveFilter} as mana_balance,
      sum(u.spice_balance) as full_spice_balance,
      sum(u.spice_balance) ${positiveFilter} as spice_balance,
      sum(u.cash_balance) as cash_balance,
      sum(uphl.investment_value) as full_investment_value,
      sum(uphl.investment_value) ${positiveFilter} as mana_investment_value,
      sum(uphl.cash_investment_value) as cash_investment_value,
      sum(uphl.loan_total) as full_loan_total,
      sum(uphl.loan_total) ${positiveFilter} as loan_total
    from users u
    left join user_portfolio_history_latest uphl on u.id = uphl.user_id`,
    undefined,
    (r: any) => ({
      fullTotalManaValue: r.full_total_mana_value,
      totalManaValue: r.total_mana_value,
      totalCashValue: r.total_cash_value,
      fullManaBalance: r.full_mana_balance,
      manaBalance: r.mana_balance,
      fullSpiceBalance: r.full_spice_balance,
      spiceBalance: r.spice_balance,
      cashBalance: r.cash_balance,
      fullInvestmentValue: r.full_investment_value,
      manaInvestmentValue: r.mana_investment_value,
      cashInvestmentValue: r.cash_investment_value,
      fullLoanTotal: r.full_loan_total,
      loanTotal: r.loan_total,
    })
  )

  const liquidity = await getAMMLiquidity()

  const totalManaValue = userPortfolio.totalManaValue + liquidity.mana
  const totalCashValue = userPortfolio.totalCashValue + liquidity.cash
  return {
    ...userPortfolio,
    ammManaLiquidity: liquidity.mana,
    ammCashLiquidity: liquidity.cash,
    totalManaValue,
    totalCashValue,
  }
}

const getAMMLiquidity = async () => {
  const pg = createSupabaseDirectClient()
  const [binaryLiquidity, multiLiquidity] = await Promise.all([
    pg.many<{ sum: number; token: 'MANA' | 'CASH' }>(
      `select
        sum((data->>'prob')::numeric * (data->'pool'->>'YES')::numeric + (1-(data->>'prob')::numeric) *(data->'pool'->>'NO')::numeric + (data->'subsidyPool')::numeric),
        token
      from contracts
      where resolution is null and mechanism = 'cpmm-1'
      group by token`,
      []
    ),
    pg.many<{ sum: number; token: 'MANA' | 'CASH' }>(
      `select sum(prob * pool_yes + (1-prob) * pool_no + subsidy_pool), contracts.token
        from answers join contracts on contract_id = contracts.id
        where contracts.resolution is null
        group by contracts.token`,
      []
    ),
  ])

  return {
    mana:
      (binaryLiquidity.find((l) => l.token === 'MANA')?.sum || 0) +
      (multiLiquidity.find((l) => l.token === 'MANA')?.sum || 0),
    cash:
      (binaryLiquidity.find((l) => l.token === 'CASH')?.sum || 0) +
      (multiLiquidity.find((l) => l.token === 'CASH')?.sum || 0),
  }
}
