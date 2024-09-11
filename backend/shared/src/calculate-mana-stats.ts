import { createSupabaseDirectClient } from 'shared/supabase/init'
import { DAY_MS } from 'common/util/time'
import { getManaSupply } from 'shared/mana-supply'
import { insert } from './supabase/utils'

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

export const calculateManaStats = async (
  startDate: number,
  numberOfDays: number
) => {
  const pg = createSupabaseDirectClient()
  for (let i = 0; i < numberOfDays; i++) {
    const startTime = new Date(startDate + i * DAY_MS).toISOString()
    const endTime = new Date(startDate + (i + 1) * DAY_MS).toISOString()

    const txnSummaries = await pg.map(
      `
        select from_type,
        to_type,
        token,
        data -> 'data' ->> 'questType' as quest_type,
        category,
        sum(amount) as total_amount
        from txns
         where created_time > $1
         and created_time < $2
         and (to_type = 'BANK' OR from_type = 'BANK')
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
    const fees = await pg.one(
      `select sum((data->'fees'->'platformFee')::numeric) as platform_fees
                from contract_bets
                where created_time >$1
                and created_time < $2`,
      [startTime, endTime],
      (row) => (row.platform_fees ? (row.platform_fees as number) : 0)
    )
    await Promise.all(
      [
        ...txnSummaries,
        {
          start_time: startTime,
          end_time: endTime,
          from_type: 'USER',
          to_type: 'BANK',
          token: 'M$',
          quest_type: null,
          category: 'BET_FEES',
          total_amount: fees,
        },
      ].map(async (txnData) => {
        await pg.none(
          `insert into txn_summary_stats (start_time, end_time, from_type, to_type, token, quest_type, category, total_amount)
                    values ($1, $2, $3, $4, $5, $6, $7, $8)
                  `,
          [...Object.values(txnData)]
        )
      })
    )
  }
  const now = new Date().toISOString()
  const ms = await getManaSupply(true)
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
