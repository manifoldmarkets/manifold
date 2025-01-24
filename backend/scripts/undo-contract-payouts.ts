import { runScript } from 'run-script'
import {
  ContractOldResolutionPayoutTxn,
  ContractUndoOldResolutionPayoutTxn,
} from 'common/txn'
import { convertTxn } from 'common/supabase/txns'
import { runAdminTxnOutsideBetQueue } from 'shared/txn/run-txn'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // previously fixed: ['hUSAOl5cRP', 'gAcpqS6sAI', 'OOSzuNUgcs']
    const contractIds = [
      'Rz8625ARCP',
      'nPC8NpcNRQ',
      'Ps2L8gdzRs',
      'sU9665Zn8y',
      'ELR0nIE8nt',
      'OA2UhZpEdZ',
      'OgSnRRz29A',
      'l0Sn5ILdd8',
      'gpc2CNLCtn',
      'PIcOngSqn0',
      '26Z9lOgql2',
      'sU9665Zn8y',
      'dLQuZIUAny',
      'AssOq668yA',
      'nPC8NpcNRQ',
      'LdPdSpgLSs',
    ]

    // Get all payout transactions for these contracts
    const txns = await pg.map(
      `SELECT * FROM txns 
       WHERE category = 'CONTRACT_RESOLUTION_PAYOUT'
       AND from_type = 'CONTRACT' 
       AND from_id = ANY($1)
       `,
      [contractIds],
      (r) => convertTxn(r) as ContractOldResolutionPayoutTxn
    )
    console.log('Reverting txns:', txns.length)
    let count = 0
    for (const txn of txns) {
      await pg.tx(async (tx) => {
        await runAdminTxnOutsideBetQueue(
          tx,
          {
            amount: txn.amount,
            toId: txn.fromId,
            fromType: 'USER',
            fromId: txn.toId,
            toType: 'CONTRACT',
            category: 'CONTRACT_UNDO_RESOLUTION_PAYOUT',
            token: txn.token,
            description: `Undo contract resolution payout from contract ${txn.fromId}`,
            data: { revertsTxnId: txn.id },
          } as ContractUndoOldResolutionPayoutTxn,
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
