import { APIError } from 'common/api/utils'
import {
  getPerpEscrowDifference,
  getPerpEscrowTolerance,
  isPerpEscrowBalanced,
} from 'common/perps/escrow'
import { PerpPool } from 'common/perps/amm'
import { SupabaseTransaction } from 'shared/supabase/init'

export const getPerpLedgerBalance = async (
  pgTrans: SupabaseTransaction,
  contractId: string
) => {
  const row = await pgTrans.one<{ balance: number | string }>(
    `select (
       coalesce(sum(
         case
           when to_type = 'CONTRACT' and to_id = $1 then amount
           else 0
         end
       ), 0)
       -
       coalesce(sum(
         case
           when from_type = 'CONTRACT' and from_id = $1 then amount
           else 0
         end
       ), 0)
     ) as balance
     from txns
     where token = 'M$'
       and (
         (to_type = 'CONTRACT' and to_id = $1)
         or (from_type = 'CONTRACT' and from_id = $1)
       )`,
    [contractId]
  )
  return Number(row.balance)
}

export const assertPerpEscrowBalance = async (
  pgTrans: SupabaseTransaction,
  contractId: string,
  pool: PerpPool
) => {
  const ledgerBalance = await getPerpLedgerBalance(pgTrans, contractId)
  const snapshot = {
    ledgerBalance,
    poolLong: pool.L,
    poolShort: pool.S,
  }
  if (!isPerpEscrowBalanced(snapshot)) {
    const difference = getPerpEscrowDifference(snapshot)
    const tolerance = getPerpEscrowTolerance(snapshot)
    throw new APIError(
      500,
      `PERP escrow invariant failed for ${contractId}: ledger=${ledgerBalance}, pools=${
        pool.L + pool.S
      }, difference=${difference}, tolerance=${tolerance}`
    )
  }
}
