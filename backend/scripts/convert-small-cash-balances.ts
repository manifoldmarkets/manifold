import { runScript } from './run-script'
import { type TxnData, runTxnInBetQueue } from 'shared/txn/run-txn'
import { CASH_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'

// NOTE: After running this script, set all users with cash_balance below 25 to 0
// to remove any lingering floating point cash balances
runScript(async ({ pg }) => {
  console.log('Finding users with cash balances below 25...')

  // Find all users with cash_balance below 25 but above 0
  const users = await pg.manyOrNone(
    `SELECT id, cash_balance, username FROM users 
     WHERE cash_balance > 0.000001 AND cash_balance < 25`,
    []
  )

  console.log(`Found ${users.length} users with small cash balances.`)

  // Process each user
  let successCount = 0
  let totalCashConverted = 0
  let totalManaGenerated = 0

  for (const user of users) {
    const userId = user.id
    // Round cash balance to 6 decimal places to avoid floating point precision issues
    const cashBalance = Math.floor(user.cash_balance * 1000000) / 1000000
    const username = user.username

    try {
      console.log(
        `Processing user ${userId} (${username}) with cash balance ${user.cash_balance} (rounded to ${cashBalance})...`
      )

      // Execute the conversion logic, similar to the convertCashToMana endpoint
      await pg.tx(async (tx) => {
        // key for equivalence
        const insertTime = Date.now()
        const amount = cashBalance // Convert the rounded balance

        const toBank: TxnData = {
          category: 'CONVERT_CASH',
          fromType: 'USER',
          fromId: userId,
          toType: 'BANK',
          toId: 'BANK',
          amount: amount,
          token: 'CASH',
          description: 'Convert cash to mana (automated script)',
          data: { insertTime, automated: true },
        }
        await runTxnInBetQueue(tx, toBank)

        const toYou: TxnData = {
          category: 'CONVERT_CASH_DONE',
          fromType: 'BANK',
          fromId: 'BANK',
          toType: 'USER',
          toId: userId,
          amount: amount * CASH_TO_MANA_CONVERSION_RATE,
          token: 'M$',
          description: 'Convert cash to mana (automated script)',
          data: { insertTime, automated: true },
        }
        await runTxnInBetQueue(tx, toYou)
      })

      successCount++
      totalCashConverted += cashBalance
      totalManaGenerated += cashBalance * CASH_TO_MANA_CONVERSION_RATE
      console.log(
        `Successfully converted ${cashBalance} CASH to ${
          cashBalance * CASH_TO_MANA_CONVERSION_RATE
        } M$ for ${username}`
      )
    } catch (error) {
      console.error(
        `Error processing user ${userId} (${username}):`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  console.log(`
Conversion summary:
Successfully processed ${successCount} out of ${users.length} users
Total CASH converted: ${totalCashConverted}
Total M$ generated: ${totalManaGenerated}
Conversion rate used: ${CASH_TO_MANA_CONVERSION_RATE}
  `)
})
