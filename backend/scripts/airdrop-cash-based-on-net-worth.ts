import { chunk } from 'lodash'
import { runScript } from './run-script'
import { type SupabaseDirectClient } from 'shared/supabase/init'
import { insertTxns } from 'shared/txn/run-txn'
import { bulkIncrementBalances } from 'shared/supabase/users'

const TIMESTAMP = '2023-08-26 09:00:00'

async function airdropCashBasedOnNetWorth(pg: SupabaseDirectClient) {
  const allBalances = await pg.manyOrNone<{
    user_id: string
    net_worth: number
  }>(
    `select
      user_id,
      investment_value + balance + spice_balance - loan_total as net_worth
    from user_portfolio_history
    where ts <= $1
    order by ts desc
    limit 1`,
    [TIMESTAMP]
  )

  const batches = chunk(
    allBalances.filter((user) => user.net_worth > 0),
    100
  )

  for (const balances of batches) {
    await pg.tx(async (tx) => {
      await bulkIncrementBalances(
        tx,
        balances.map((user) => ({
          id: user.user_id,
          cashBalance: user.net_worth,
          totalCashDeposits: user.net_worth,
        }))
      )

      await insertTxns(
        tx,
        balances.map((user) => ({
          token: 'CASH',
          amount: user.net_worth,
          category: 'AIR_DROP',
          fromType: 'BANK',
          fromId: 'BANK',
          toId: user.user_id,
          toType: 'USER',
        }))
      )
    })
  }
}

runScript(async ({ pg }) => {
  await airdropCashBasedOnNetWorth(pg)
})
