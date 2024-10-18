import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  CompleteSessionDirectCashierResponse,
  ProcessSessionCode,
} from 'common/gidx/gidx'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
  GIDX_BASE_URL,
} from 'shared/gidx/helpers'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { track } from 'shared/analytics'
import { isAdminId, TWOMBA_ENABLED } from 'common/envs/constants'
import { getUser } from 'shared/utils'

const ENDPOINT = GIDX_BASE_URL + '/v3.0/api/DirectCashier/CompleteSession'
export const completeCashoutSession: APIHandler<
  'complete-cashout-session-gidx'
> = async (props, auth) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const pg = createSupabaseDirectClient()

  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Unauthorized')
  }
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
    SavePaymentMethod,
    txnId,
  } = props

  const userId = props.userId
  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)

  const user = await getUser(userId, pg)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  log('Complete cashout session merchant info:', {
    MerchantSessionID,
    MerchantTransactionID,
  })

  const body = {
    PaymentAmount: {
      PaymentAmount: PaymentAmount.dollars,
      BonusAmount: 0,
    },
    SavePaymentMethod,
    DeviceIpAddress: props.ip,
    MerchantTransactionID,
    PaymentMethod: {
      ...PaymentMethod,
      PhoneNumber: phoneNumberWithCode,
    },
  }
  log('complete cashout session body:', body)

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
    track(userId, 'gidx complete cashout session', {
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
    track(userId, 'gidx complete cashout session', {
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
  track(userId, 'gidx complete cashout session', {
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
    await updateStatusAndSaveReceipt(userId, txnId, cashierResponse)
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
    await updateStatusAndSaveReceipt(userId, txnId, cashierResponse)
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

const updateStatusAndSaveReceipt = async (
  userId: string,
  txnId: string,
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
  const pg = createSupabaseDirectClient()

  const {
    ApiKey: _,
    MerchantID: __,
    CustomerRegistration: ___,
    LocationDetail: ____,
    ...dataToWrite
  } = response
  await pg.tx(async (tx) => {
    await tx.none(
      `
      update redemption_status set
        status = $1,
        session_id = $2,
        transaction_id = $3
      where txn_id = $4
        `,
      ['processing', SessionID, MerchantTransactionID, txnId]
    )

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
        txnId,
        JSON.stringify(dataToWrite),
      ]
    )
    await tx.none(
      `
      delete from delete_after_reading where user_id = $1 and data->>'txnId' = $2
     `,
      [userId, txnId]
    )
  })
}
