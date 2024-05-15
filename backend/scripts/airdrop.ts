import { runScript } from 'run-script'
import { runTxnFromBank } from 'shared/txn/run-txn'

const AIR_DROP_AMOUNT = 10 * 1000

if (require.main === module) {
  runScript(async ({ pg }) => {
    const recentlyActiveUserIds = await pg.map<string>(
      `
      SELECT user_id, COUNT(DISTINCT DATE(contract_bets.created_time)) AS unique_bet_days
      FROM contract_bets
      WHERE contract_bets.created_time > '2024-01-01'
      GROUP BY user_id
      HAVING COUNT(DISTINCT DATE(contract_bets.created_time)) >= 30
      order by unique_bet_days desc
    `,
      [],
      (r) => r.id
    )

    console.log('Recently active users', recentlyActiveUserIds.length)

    await pg.tx(async (tx) => {
      for (const userId of recentlyActiveUserIds) {
        await runTxnFromBank(tx, {
          fromType: 'BANK',
          toType: 'USER',
          toId: userId,
          amount: AIR_DROP_AMOUNT,
          category: 'AIR_DROP',
          token: 'M$',
          description: 'Pivot airdrop!',
        })
      }
    })
  })
}
