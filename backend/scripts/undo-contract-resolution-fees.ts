import { runScript } from 'run-script'
import { ProfitFeeTxn, UndoResolutionFeeTxn } from 'common/txn'
import { convertTxn } from 'common/supabase/txns'
import { runAdminTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getContractsDirect } from 'shared/supabase/contracts'

if (require.main === module) {
  runScript(async ({ pg }) => {
    // Get all payout transactions for these contracts
    const txns = await pg.map(
      `SELECT * FROM txns 
       WHERE category = 'CONTRACT_RESOLUTION_FEE'
       AND from_type = 'USER'
       `,
      [],
      (r) => convertTxn(r) as ProfitFeeTxn
    )
    const contracts = await getContractsDirect(
      txns.map((t) => t.data.contractId),
      pg
    )
    const arbitrageContracts = contracts.filter(
      (c) => c.mechanism === 'cpmm-multi-1' && c.shouldAnswersSumToOne
    )
    // Filter txns for arbitrage contracts
    const txnsToDeDupe = txns.filter((t) =>
      arbitrageContracts.some((c) => c.id === t.data.contractId)
    )
    console.log('Total txns for arbitrage contracts:', txnsToDeDupe.length)

    // Group transactions by user and contract
    const grouped = new Map<string, ProfitFeeTxn[]>()
    for (const txn of txnsToDeDupe) {
      const key = `${txn.fromId}__${txn.data.contractId}`
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(txn)
    }

    // For each group, if there are duplicates, keep one and mark the rest for reversion
    const txnsToRevert: ProfitFeeTxn[] = []
    for (const [, group] of grouped) {
      if (group.length > 1) {
        group.sort((a, b) => a.id.localeCompare(b.id)) // sort to deterministically keep the first txn
        const duplicates = group.slice(1) // keep first, revert rest
        txnsToRevert.push(...duplicates)
      }
    }
    console.log('Duplicate txns to revert:', txnsToRevert.length)
    let count = 0
    for (const txn of txnsToRevert) {
      await pg.tx(async (tx) => {
        await runAdminTxnOutsideBetQueue(
          tx,
          {
            amount: txn.amount,
            toId: txn.fromId,
            fromType: 'BANK',
            fromId: txn.toId,
            toType: 'USER',
            category: 'UNDO_CONTRACT_RESOLUTION_FEE',
            token: txn.token,
            description: `Undo contract resolution fee payout from contract ${txn.fromId}`,
            data: { revertsTxnId: txn.id, contractId: txn.data.contractId },
          } as UndoResolutionFeeTxn,
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
