import { runScript } from 'run-script'
import { ProfitFeeTxn, UndoResolutionFeeTxn } from 'common/txn'
import { convertTxn } from 'common/supabase/txns'
import { runAdminTxnOutsideBetQueue } from 'shared/txn/run-txn'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // Get all payout transactions for these contracts
    const txns = await pg.map(
      `SELECT * FROM txns 
       WHERE category = 'UNDO_CONTRACT_RESOLUTION_FEE'
       and created_time > now() - interval '1 day'
       `,
      [],
      (r) => convertTxn(r) as UndoResolutionFeeTxn
    )
    console.log('Total txns for redo resolution fees:', txns.length)
    let count = 0
    const payoutStartTime = Date.now()
    for (const txn of txns) {
      await pg.tx(async (tx) => {
        await runAdminTxnOutsideBetQueue(
          tx,
          {
            amount: txn.amount,
            toId: txn.fromId,
            fromType: 'USER',
            fromId: txn.toId,
            toType: 'BANK',
            category: 'CONTRACT_RESOLUTION_FEE',
            token: txn.token,
            description: `Redo contract resolution fee payout from txn: ${txn.id}`,
            data: {
              contractId: txn.data.contractId,
              payoutStartTime,
            },
          } as ProfitFeeTxn,
          true
        )
        count++
        console.log('reverted txn', txn.id)
        console.log('reverted', count, 'txns')
      })
    }
    console.log('reverted txns')
  })
}
