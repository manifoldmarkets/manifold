import { SupabaseDirectClient } from 'shared/supabase/init'
import { DAY_MS } from 'common/util/time'
import {
  getManaSupply,
  getManaSupplyEachDayBetweeen as getManaSupplyEachDay,
} from 'shared/mana-supply'
import { bulkInsert, insert } from './supabase/utils'
import { log } from './utils'

type txnStats = {
  start_time: string
  end_time: string
  from_type: string
  to_type: string
  token: string
  quest_type: string | null
  category: string
  total_amount: number
}

export const updateTxnStats = async (
  pg: SupabaseDirectClient,
  startDate: number,
  numberOfDays: number
) => {
  for (let i = 0; i < numberOfDays; i++) {
    const startTime = new Date(startDate + i * DAY_MS).toISOString()
    const endTime = new Date(startDate + (i + 1) * DAY_MS).toISOString()

    log('Getting txn sums')
    const txnSummaries = await pg.map(
      `
        select from_type,
        to_type,
        token,
        data -> 'data' ->> 'questType' as quest_type,
        category,
        sum(amount) as total_amount
        from txns
         where created_time >= $1
         and created_time < $2
         and (to_type = 'BANK' OR from_type = 'BANK' OR category = 'ADD_SUBSIDY')
         and category not in ('CONSUME_SPICE', 'CONSUME_SPICE_DONE')
        group by from_type,
          to_type,
          token,
          data -> 'data' ->> 'questType',
          category;`,
      [startTime, endTime],
      (row) =>
        ({
          start_time: startTime,
          end_time: endTime,
          ...row,
        } as txnStats)
    )

    log('Getting betting fees')
    const fees = await pg.one(
      `select
          sum((b.data->'fees'->'platformFee')::numeric)
            filter (where c.token = 'MANA') as mana_platform_fees,
          sum((b.data->'fees'->'platformFee')::numeric)
            filter (where c.token = 'CASH') as cash_platform_fees
          from contract_bets b join contracts c
          on b.contract_id = c.id
          where b.created_time >= $1
          and b.created_time < $2`,
      [startTime, endTime]
    )

    log(`Inserting txn stats for start_time ${startTime}`)
    await bulkInsert(pg, 'txn_summary_stats', [
      ...txnSummaries,
      {
        start_time: startTime,
        end_time: endTime,
        from_type: 'USER',
        to_type: 'BANK',
        token: 'M$',
        quest_type: null,
        category: 'BET_FEES',
        total_amount: fees.mana_platform_fees ?? 0,
      },
      {
        start_time: startTime,
        end_time: endTime,
        from_type: 'USER',
        to_type: 'BANK',
        token: 'CASH',
        quest_type: null,
        category: 'BET_FEES',
        total_amount: fees.cash_platform_fees ?? 0,
      },
    ])
  }
}

export const insertLatestManaStats = async (pg: SupabaseDirectClient) => {
  const now = new Date().toISOString()
  const ms = await getManaSupply(pg)
  await insert(pg, 'mana_supply_stats', {
    start_time: now,
    end_time: now,
    total_value: ms.totalManaValue,
    total_cash_value: ms.totalCashValue,
    balance: ms.manaBalance,
    cash_balance: ms.cashBalance,
    spice_balance: ms.spiceBalance,
    investment_value: ms.manaInvestmentValue,
    cash_investment_value: ms.cashInvestmentValue,
    loan_total: ms.loanTotal,
    amm_liquidity: ms.ammManaLiquidity,
    amm_cash_liquidity: ms.ammCashLiquidity,
  })
}

export const updateManaStatsBetween = async (
  pg: SupabaseDirectClient,
  startDate: number,
  numberOfDays: number
) => {
  const stats = await getManaSupplyEachDay(pg, startDate, numberOfDays)
  await bulkInsert(
    pg,
    'mana_supply_stats',
    stats.map((ms) => ({
      start_time: ms.day,
      end_time: ms.day,
      total_value: ms.totalManaValue,
      total_cash_value: ms.totalCashValue,
      balance: ms.manaBalance,
      cash_balance: ms.cashBalance,
      spice_balance: ms.spiceBalance,
      investment_value: ms.manaInvestmentValue,
      cash_investment_value: ms.cashInvestmentValue,
      loan_total: ms.loanTotal,
      amm_liquidity: 0,
      amm_cash_liquidity: 0,
    }))
  )
}
