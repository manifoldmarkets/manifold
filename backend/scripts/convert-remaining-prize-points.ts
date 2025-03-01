import { runScript } from './run-script'
import { type TxnData, insertTxns } from 'shared/txn/run-txn'
import { SPICE_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'
import { betsQueue } from 'shared/helpers/fn-queue'
import { bulkIncrementBalances } from 'shared/supabase/users'

runScript(async ({ pg }) => {
  // Fetch users with remaining prize points
  const usersWithPrizePoints = await pg.manyOrNone<{
    id: string
    spice_balance: number
  }>(`select id, spice_balance from users where spice_balance > 0`)

  const insertTime = Date.now()

  await betsQueue.enqueueFn(
    async () => {
      console.log(
        `Found ${usersWithPrizePoints.length} users with remaining prize points.`
      )

      const txns: TxnData[] = []
      const balances: { id: string; spiceBalance: number; balance: number }[] =
        []

      usersWithPrizePoints.forEach(({ id, spice_balance }) => {
        const toBank: TxnData = {
          category: 'CONSUME_SPICE',
          fromType: 'USER',
          fromId: id,
          toType: 'BANK',
          toId: 'BANK',
          amount: spice_balance,
          token: 'SPICE',
          description: 'Convert prize points to mana',
          data: { insertTime, isLast: true },
        }

        const toYou: TxnData = {
          category: 'CONSUME_SPICE_DONE',
          fromType: 'BANK',
          fromId: 'BANK',
          toType: 'USER',
          toId: id,
          amount: spice_balance * SPICE_TO_MANA_CONVERSION_RATE,
          token: 'M$',
          description: 'Convert prize points to mana',
          data: { insertTime, isLast: true },
        }

        txns.push(toBank, toYou)

        balances.push({
          id,
          spiceBalance: -spice_balance,
          balance: spice_balance * SPICE_TO_MANA_CONVERSION_RATE,
        })
      })

      await pg.tx(async (tx) => {
        await insertTxns(tx, txns)
        console.log(
          `Inserted ${txns.length} transactions for prize point conversion.`
        )
        await bulkIncrementBalances(tx, balances)
      })
    },
    usersWithPrizePoints.map((user) => user.id)
  )

  console.log('Script completed successfully.')
  console.log(`The time was ${insertTime}`)
})

/*
create view final_pp_balances as

select from_id as user_id, amount from txns
where category = 'CONSUME_SPICE'
and data->'data'->>'isLast' is not null
*/
