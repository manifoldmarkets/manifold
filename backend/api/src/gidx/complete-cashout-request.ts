import { APIError, APIHandler } from 'api/helpers/endpoint'
import { ValidatedAPIParams } from 'common/api/schema'
import { SWEEPIES_CASHOUT_FEE } from 'common/economy'
import { PaymentMethod } from 'common/gidx/gidx'
import { CashOutPendingTxn } from 'common/txn'
import { floatingEqual } from 'common/util/math'
import { getIp, track } from 'shared/analytics'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue } from 'shared/txn/run-txn'
import { getUser } from 'shared/utils'

export const completeCashoutRequest: APIHandler<
  'complete-cashout-request'
> = async (props, auth, req) => {
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

  if (user.cashBalance < manaCashAmount) {
    throw new APIError(400, 'Insufficient balance')
  }
  const dollarsToWithdraw = PaymentAmount.dollars
  const CalculatedPaymentAmount = manaCashAmount - SWEEPIES_CASHOUT_FEE
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
      const user = await getUser(userId, tx)
      if (!user) {
        throw new APIError(404, 'User not found')
      }
      redeemablePrizeCash = user.cashBalance
      cash = user.cashBalance
    } catch (e) {
      log.error('Indeterminate state, may need to refund', { response: props })
      throw e
    }

    if (redeemablePrizeCash < manaCashAmount) {
      throw new APIError(
        500,
        'Insufficient redeemable sweepcash. Indeterminate state, may need to refund',
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
