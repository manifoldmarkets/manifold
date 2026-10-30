import { runScript } from 'run-script'

import { refundPendingPerpOrders } from 'shared/perps/orders'

// Refunds queued perp orders without executing them: the incident and
// rollback lever for next-price execution. PERP_TRADING_MODE only stops new
// submissions; orders already queued keep filling until drained here (or
// until MANA trading is toggled off site-wide). Run it BEFORE rolling back to
// code that does not know perp_orders, or reserves stay in
// BANK:PERP_ORDER_ESCROW.
//
// Usage:
//   ts-node refund-pending-perp-orders.ts                  # dry run, all markets
//   ts-node refund-pending-perp-orders.ts <contractId>...  # dry run, listed markets
//   add --apply to refund
runScript(async ({ pg }) => {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const ids = args.filter((a) => !a.startsWith('--'))
  const rows = await pg.manyOrNone<{ contract_id: string; count: number }>(
    `select contract_id, count(*)::int as count from perp_orders
     where status = 'pending' and ($1::text[] is null or contract_id = any($1))
     group by contract_id order by contract_id`,
    [ids.length ? ids : null]
  )
  for (const { contract_id, count } of rows) {
    console.log(`${contract_id}: ${count} pending`)
    if (!apply) continue
    const { deferred } = await refundPendingPerpOrders(
      contract_id,
      'Cancelled by Manifold.'
    )
    console.log(
      deferred.length
        ? `${contract_id}: ${deferred.length} contended; re-run to refund them`
        : `${contract_id}: refunded`
    )
  }
  if (!apply) console.log('Dry run. Pass --apply to refund.')
})
