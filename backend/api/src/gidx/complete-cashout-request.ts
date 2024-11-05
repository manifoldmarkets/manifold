import { APIError, APIHandler } from 'api/helpers/endpoint'
import { PaymentMethod } from 'common/gidx/gidx'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getIp, track } from 'shared/analytics'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { getUser } from 'shared/utils'
import { SWEEPIES_CASHOUT_FEE } from 'common/economy'
import { calculateRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'
import { floatingEqual } from 'common/util/math'
import { ValidatedAPIParams } from 'common/api/schema'
import { CashOutPendingTxn } from 'common/txn'

export const completeCashoutRequest: APIHandler<
  'complete-cashout-request'
> = async (props, auth, req) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const pg = createSupabaseDirectClient()
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
  } = props

  const userId = auth.uid

  const user = await getUser(userId, pg)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  log('Request cashout session merchant info:', {
    MerchantSessionID,
    MerchantTransactionID,
  })

  const manaCashAmount = PaymentAmount.manaCash
  const { redeemable } = await calculateRedeemablePrizeCash(pg, userId)

  if (redeemable < manaCashAmount) {
    throw new APIError(400, 'Insufficient redeemable prize cash')
  }
  const dollarsToWithdraw = PaymentAmount.dollars
  const CalculatedPaymentAmount = (1 - SWEEPIES_CASHOUT_FEE) * manaCashAmount
  if (dollarsToWithdraw !== CalculatedPaymentAmount) {
    throw new APIError(400, 'Payment amount mismatch')
  }

  track(userId, 'Complete cashout request', {
    status: 'manual',
    message: 'Payment successful',
  })
  await debitCoins(userId, manaCashAmount, props, PaymentMethod, getIp(req))
  return {
    status: 'success',
    message: 'Payment successful',
  }
}

const debitCoins = async (
  userId: string,
  manaCashAmount: number,
  props: ValidatedAPIParams<'complete-cashout-request'>,
  paymentMethod: Omit<PaymentMethod, 'Token' | 'DisplayName'>,
  ip: string
) => {
  const { MerchantTransactionID, MerchantSessionID, PaymentAmount, DeviceGPS } =
    props
  const dataToDelete = {
    ...paymentMethod,
    ip,
    gps: DeviceGPS,
  }
  const data = {
    merchantSessionId: MerchantSessionID,
    transactionId: MerchantTransactionID,
    type: 'manual',
    payoutInDollars: PaymentAmount.dollars,
  } as const
  const pg = createSupabaseDirectClient()
  const manaCashoutTxn: Omit<CashOutPendingTxn, 'id' | 'createdTime'> = {
    fromId: userId,
    fromType: 'USER',
    toId: 'EXTERNAL',
    toType: 'BANK',
    data,
    amount: manaCashAmount,
    token: 'CASH',
    category: 'CASH_OUT',
    description: `Redemption debit`,
  }
  const cash = await pg.tx(async (tx) => {
    let redeemablePrizeCash: number
    let cash: number
    try {
      const { redeemable, cashBalance } = await calculateRedeemablePrizeCash(
        tx,
        userId
      )
      redeemablePrizeCash = redeemable
      cash = cashBalance
    } catch (e) {
      log.error('Indeterminate state, may need to refund', { response: props })
      throw e
    }

    if (redeemablePrizeCash < manaCashAmount) {
      throw new APIError(
        500,
        'Insufficient redeemable prize cash. Indeterminate state, may need to refund',
        { response: props }
      )
    }
    const txn = await runTxnInBetQueue(tx, manaCashoutTxn)
    await tx.none(
      `
      insert into redemption_status (user_id, status, session_id, transaction_id, txn_id) values ($1, $2, $3, $4, $5)
        `,
      [userId, 'review', MerchantSessionID, MerchantTransactionID, txn.id]
    )
    await tx.none(
      `insert into delete_after_reading (user_id, data) values ($1, $2)`,
      [
        userId,
        JSON.stringify({
          ...dataToDelete,
          txnId: txn.id,
        }),
      ]
    )
    log('Run cashout txn, redeemable:', redeemablePrizeCash)
    log('Cash balance for user prior to txn', cash)
    const balanceAfter = await tx.one(
      `select cash_balance from users where id = $1`,
      [userId],
      (r) => r.cash_balance
    )
    log('Run cashout txn, cash balance for user after txn', balanceAfter)
    if (!floatingEqual(cash - manaCashAmount, balanceAfter)) {
      log.error(
        'Cash balance after txn does not match expected. Admin should take a look.'
      )
    }
    return cash
  })
  const balanceAfter = await pg.one(
    `select cash_balance from users where id = $1`,
    [userId],
    (r) => r.cash_balance
  )
  const expectedBalance = cash - manaCashAmount
  log(
    'Double checking cash balance after txn',
    balanceAfter,
    'should be',
    expectedBalance
  )
  if (!floatingEqual(expectedBalance, balanceAfter)) {
    log.error(
      'Cash balance after txn does not match expected. Admin should take a look.'
    )
  }
}
