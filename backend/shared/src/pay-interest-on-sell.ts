import { INTEREST_ENABLED } from 'common/economy'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { ContractToken } from 'common/contract'
import { removeUndefinedProps } from 'common/util/object'
import { SupabaseTransaction } from './supabase/init'
import { TxnData, txnToRow } from './txn/run-txn'
import { isProd, log } from './utils'
import { bulkIncrementBalancesQuery } from './supabase/users'
import { bulkInsertQuery } from './supabase/utils'
import { calculateInterestForSell } from './calculate-interest'

/**
 * Pay interest to a user when they sell shares.
 *
 * Interest is calculated based on:
 * 1. Share-days accumulated from all their bets up to the sell time
 * 2. Current market probability (not resolution probability)
 *
 * This provides immediate interest payment proportional to current value.
 */
export async function payInterestOnSell(
  tx: SupabaseTransaction,
  contractId: string,
  userId: string,
  answerId: string | undefined,
  sellTime: number,
  currentProb: number,
  token: ContractToken
): Promise<{ interest: number; yesShareDays: number; noShareDays: number }> {
  // Feature flag - easy kill switch
  if (!INTEREST_ENABLED) return { interest: 0, yesShareDays: 0, noShareDays: 0 }

  // Only MANA markets earn interest
  if (token !== 'MANA') return { interest: 0, yesShareDays: 0, noShareDays: 0 }

  // Calculate interest for this user's position up to the sell time
  const { interest, yesShareDays, noShareDays } =
    await calculateInterestForSell(
      tx,
      contractId,
      userId,
      answerId,
      sellTime,
      currentProb,
      token
    )

  if (interest <= 0) {
    return { interest: 0, yesShareDays, noShareDays }
  }

  log('Paying interest on sell', {
    userId,
    contractId,
    answerId,
    interest,
    yesShareDays,
    noShareDays,
    currentProb,
  })

  // Create balance update and transaction
  const balanceUpdate = {
    id: userId,
    balance: interest,
  }

  const txn: TxnData = {
    category: 'INTEREST_PAYOUT',
    fromType: 'BANK',
    fromId: isProd()
      ? HOUSE_LIQUIDITY_PROVIDER_ID
      : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
    toType: 'USER',
    toId: userId,
    amount: interest,
    token: 'M$',
    data: removeUndefinedProps({
      contractId,
      answerId,
      yesShareDays,
      noShareDays,
      payoutStartTime: sellTime,
      sellProb: currentProb,
    }),
  }

  // Execute the balance update and transaction
  const balanceUpdatesQuery = bulkIncrementBalancesQuery([balanceUpdate])
  const insertTxnsQuery = bulkInsertQuery('txns', [txnToRow(txn)], false)

  await tx.multi(`${balanceUpdatesQuery}; ${insertTxnsQuery}`)

  return { interest, yesShareDays, noShareDays }
}
