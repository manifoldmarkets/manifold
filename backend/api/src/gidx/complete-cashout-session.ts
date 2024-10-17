import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  CompleteSessionDirectCashierResponse,
  PaymentMethod,
  ProcessSessionCode,
} from 'common/gidx/gidx'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
  getLocalServerIP,
  GIDX_BASE_URL,
} from 'shared/gidx/helpers'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxn } from 'shared/txn/run-txn'
import { getIp, track } from 'shared/analytics'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { getUser, LOCAL_DEV } from 'shared/utils'
import { SWEEPIES_CASHOUT_FEE } from 'common/economy'
import { calculateRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'
import { floatingEqual } from 'common/util/math'
import { ValidatedAPIParams } from 'common/api/schema'
import { CashOutPendingTxn } from 'common/txn'

const ENDPOINT = GIDX_BASE_URL + '/v3.0/api/DirectCashier/CompleteSession'
const MANUALLY_PROCESS_CASH_OUT = true
export const completeCashoutSession: APIHandler<
  'complete-cashout-session-gidx'
> = async (props, auth, req) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const pg = createSupabaseDirectClient()
  const userId = auth.uid
  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)

  const user = await getUser(userId, pg)
  if (!user) {
    throw new APIError(404, 'User not found')
  }
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
    SavePaymentMethod,
  } = props
  log('Complete cashout session merchant info:', {
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
  const body = {
    PaymentAmount: {
      PaymentAmount: CalculatedPaymentAmount,
      BonusAmount: 0,
    },
    SavePaymentMethod,
    DeviceIpAddress: LOCAL_DEV ? await getLocalServerIP() : getIp(req),
    MerchantTransactionID,
    PaymentMethod: {
      ...PaymentMethod,
      PhoneNumber: phoneNumberWithCode,
    },
  }
  log('complete cashout session body:', body)
  if (MANUALLY_PROCESS_CASH_OUT) {
    track(auth.uid, 'gidx complete cashout session', {
      status: 'manual',
      message: 'Payment successful',
    })
    await debitCoinsManual(
      userId,
      manaCashAmount,
      props,
      PaymentMethod,
      getIp(req)
    )
    return {
      status: 'success',
      message: 'Payment successful',
    }
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...body,
      ...getGIDXStandardParams(MerchantSessionID),
    }),
  })
  if (!res.ok) {
    track(auth.uid, 'gidx complete cashout session', {
      status: 'error',
      message: 'GIDX error',
    })
    throw new APIError(400, 'GIDX complete cashout session failed')
  }
  const cashierResponse =
    (await res.json()) as CompleteSessionDirectCashierResponse
  log('Complete checkout session response:', cashierResponse)
  const {
    SessionStatusCode,
    AllowRetry,
    PaymentDetails,
    SessionStatusMessage,
    ResponseCode,
    ResponseMessage,
  } = cashierResponse
  if (ResponseCode >= 300) {
    track(auth.uid, 'gidx complete cashout session', {
      status: 'error',
      message: 'Error: ' + ResponseMessage,
      gidxMessage: SessionStatusMessage,
    })
    return {
      status: 'error',
      message: 'Error: ' + ResponseMessage,
      gidxMessage: SessionStatusMessage,
    }
  }
  const { status, message, gidxMessage } = ProcessSessionCode(
    SessionStatusCode,
    SessionStatusMessage,
    AllowRetry
  )
  track(auth.uid, 'gidx complete cashout session', {
    status,
    message,
    gidxMessage,
  })
  if (status !== 'success') {
    return { status, message, gidxMessage }
  }

  const {
    PaymentStatusCode,
    PaymentStatusMessage,
    PaymentAmount: CompletedPaymentAmount,
  } = PaymentDetails[0]
  if (CompletedPaymentAmount !== PaymentAmount.dollars) {
    log.error('Payment amount mismatch', {
      CompletedPaymentAmount,
      PaymentAmount,
    })
  }
  if (PaymentStatusCode === '1') {
    // This should always return a '0' for pending, but just in case
    await debitCoins(userId, manaCashAmount, cashierResponse)
    return {
      status: 'success',
      message: 'Payment successful',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '2') {
    return {
      status: 'error',
      message: 'Payment ineligible',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '3') {
    return {
      status: 'error',
      message: 'Payment failed',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '4') {
    return {
      status: 'pending',
      message: 'Payment processing',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '5') {
    return {
      status: 'error',
      message: 'Payment reversed',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '6') {
    return {
      status: 'error',
      message: 'Payment canceled',
      gidxMessage: PaymentStatusMessage,
    }
  } else if (PaymentStatusCode === '0') {
    await debitCoins(userId, manaCashAmount, cashierResponse)
    return {
      status: 'pending',
      message: 'Payment pending',
      gidxMessage: PaymentStatusMessage,
    }
  }

  return {
    status: 'error',
    message: 'Unknown payment status',
  }
}

const debitCoins = async (
  userId: string,
  manaCashAmount: number,
  response: CompleteSessionDirectCashierResponse
) => {
  const {
    MerchantTransactionID,
    PaymentDetails,
    SessionStatusMessage,
    ReasonCodes,
    SessionID,
    SessionStatusCode,
  } = response
  const {
    CurrencyCode,
    PaymentAmount,
    PaymentMethodType,
    PaymentStatusCode,
    PaymentStatusMessage,
    PaymentAmountType,
  } = PaymentDetails[0]
  const data = {
    sessionId: SessionID,
    transactionId: MerchantTransactionID,
    type: 'gidx',
    payoutInDollars: PaymentDetails[0].PaymentAmount,
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
  const {
    ApiKey: _,
    MerchantID: __,
    CustomerRegistration: ___,
    LocationDetail: ____,
    ...dataToWrite
  } = response
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
      log.error('Indeterminate state, may need to refund', { response })
      throw e
    }

    if (redeemablePrizeCash < manaCashAmount) {
      throw new APIError(
        500,
        'Insufficient redeemable prize cash. Indeterminate state, may need to refund',
        { response }
      )
    }
    log('Run cashout txn, redeemable:', redeemablePrizeCash)
    log('Cash balance for user prior to txn', cash)
    const txn = await runTxn(tx, manaCashoutTxn)
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
    log('Insert gidx receipt')
    await tx.none(
      `
    insert into gidx_receipts (
      user_id,
      merchant_transaction_id,
      payment_status_code,
      payment_status_message,
      session_id,
      reason_codes,
      currency,
      amount,
      payment_method_type,
      payment_amount_type,
      status,
      status_code,
      txn_id,
      payment_data
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
    )
  `,
      [
        userId,
        MerchantTransactionID,
        PaymentStatusCode,
        PaymentStatusMessage,
        SessionID,
        ReasonCodes,
        CurrencyCode,
        PaymentAmount,
        PaymentMethodType,
        PaymentAmountType,
        SessionStatusMessage,
        SessionStatusCode,
        txn.id,
        JSON.stringify(dataToWrite),
      ]
    )
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
// TODO:
// create a new endpoint where admins manually process cashouts,
// creating a cashout session with the user's info and the amount,
// completing it, and deleting the row from delete_after_reading

const debitCoinsManual = async (
  userId: string,
  manaCashAmount: number,
  response: ValidatedAPIParams<'complete-cashout-session-gidx'>,
  paymentMethod: Omit<PaymentMethod, 'Token' | 'DisplayName'>,
  ip: string
) => {
  const { MerchantTransactionID, MerchantSessionID, PaymentAmount, DeviceGPS } =
    response
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
      log.error('Indeterminate state, may need to refund', { response })
      throw e
    }

    if (redeemablePrizeCash < manaCashAmount) {
      throw new APIError(
        500,
        'Insufficient redeemable prize cash. Indeterminate state, may need to refund',
        { response }
      )
    }
    const txn = await runTxn(tx, manaCashoutTxn)
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
