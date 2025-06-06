import { uniq } from 'lodash'
import { runScript } from 'run-script'
import { runTxn } from 'shared/txn/run-txn'

const txnsToUndo = [
  'D78upLHj', // 10-01 Wobbles 50 to mriya
  '4iBKd3Yl', // 10-01 Wobbles 30.42 to mriya
  '05k1llBN', // 09-20 Will 50 to propublica
  'Uvyq4Ir6', // Steph Bakmarin 50 to givewell
  'ABByEywJ', // Steph Bakmarin 900 to givewell
]

runScript(async ({ pg }) => {
  // sanity checks
  if (Date.now() < new Date('2024-10-03').getTime()) {
    throw new Error(
      'Are you sure you meant to run this? Delete this time check if so'
    )
  }

  // const txns = await pg.many(`select * from txns where cateogry = 'CHARITY and token = 'CASH' and amount > 0`)
  const txns = await pg.many(
    `select * from txns where id in ($1:list) order by created_time asc`,
    [txnsToUndo]
  )

  console.log('to revert:')
  console.table(txns)

  const userIds = uniq(txns.flatMap((t) => [t.from_id, t.to_id]))
  const usersBefore = await pg.many(
    `select name, id, balance, spice_balance, cash_balance from users where id in ($1:list)`,
    [userIds]
  )
  console.log(`user balances before:`)
  console.table(usersBefore)

  // Note you have to comment out the negative check in runTxn
  await pg.tx(async (tx) => {
    for (const txn of txns) {
      // reverse the donation
      await runTxn(tx, {
        fromType: txn.from_type,
        fromId: txn.from_id,
        toType: txn.to_type,
        toId: txn.to_id,
        amount: -1 * txn.amount,
        category: txn.category,
        token: txn.token,
        data: { reverses: txn.id },
      })
    }
  })

  const usersAfter = await pg.many(
    `select name, id, balance, spice_balance, cash_balance from users where id in ($1:list)`,
    [userIds]
  )
  console.log(`user balances after:`)
  console.table(usersAfter)
})
