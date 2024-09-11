import { APIError, APIHandler } from 'api/helpers/endpoint'
import { PaymentAmount, PaymentAmountsGIDX } from 'common/economy'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import {
  CompleteSessionDirectCashierResponse,
  ProcessSessionCode,
} from 'common/gidx/gidx'
import { getIp } from 'shared/analytics'
import {
  getGIDXStandardParams,
  getLocalServerIP,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { runTxn } from 'shared/txn/run-txn'
import { getUser, LOCAL_DEV } from 'shared/utils'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DirectCashier/CompleteSession'

const getPaymentAmountForWebPrice = (price: number) => {
  const amount = PaymentAmountsGIDX.find((p) => p.priceInDollars === price)
  if (!amount) {
    throw new APIError(400, 'Invalid price')
  }
  return amount
}

export const completeCheckoutSession: APIHandler<
  'complete-checkout-session-gidx'
> = async (props, auth, req) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')

  const userId = auth.uid
  const user = await getUser(userId)
  if (!user) throw new APIError(500, 'Your account was not found')

  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
  } = props
  const paymentAmount = getPaymentAmountForWebPrice(
    PaymentAmount.priceInDollars
  )

  const { creditCard, Type, BillingAddress, NameOnAccount, SavePaymentMethod } =
    PaymentMethod
  if (Type === 'CC' && !creditCard) {
    throw new APIError(400, 'Must include credit card information')
  }
  const body = {
    PaymentAmount: {
      PaymentAmount: PaymentAmount.priceInDollars,
      BonusAmount: 0,
    },
    DeviceIpAddress: LOCAL_DEV ? await getLocalServerIP() : getIp(req),
    MerchantTransactionID,
    SavePaymentMethod,
    PaymentMethod: {
      Type,
      NameOnAccount,
      ...creditCard,
      PhoneNumber: phoneNumberWithCode,
      BillingAddress,
    },
    ...getGIDXStandardParams(MerchantSessionID),
  }
  const {
    PaymentMethod: {
      CardNumber: _,
      ExpirationDate: __,
      CVV: ___,
      ...paymentMethodWithoutCCInfo
    },
    ...bodyWithoutPaymentMethod
  } = body
  const bodyToLog = {
    ...bodyWithoutPaymentMethod,
    PaymentMethod: paymentMethodWithoutCCInfo,
  }
  log('Complete checkout session body:', bodyToLog)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new APIError(400, 'GIDX complete checkout session failed')
  }
  const data = (await res.json()) as CompleteSessionDirectCashierResponse
  log('Complete checkout session response:', data)
  const {
    SessionStatusCode,
    AllowRetry,
    PaymentDetails,
    SessionStatusMessage,
    ResponseCode,
    SessionID,
  } = data
  if (ResponseCode >= 300) {
    return {
      status: 'error',
      message: 'GIDX error',
      gidxMessage: SessionStatusMessage,
    }
  }
  const { status, message, gidxMessage } = ProcessSessionCode(
    SessionStatusCode,
    SessionStatusMessage,
    AllowRetry
  )
  if (status !== 'success') {
    return { status, message, gidxMessage }
  }

  const {
    PaymentStatusCode,
    PaymentStatusMessage,
    PaymentAmount: CompletedPaymentAmount,
  } = PaymentDetails[0]
  if (CompletedPaymentAmount !== PaymentAmount.priceInDollars) {
    log.error('Payment amount mismatch', {
      CompletedPaymentAmount,
      PaymentAmount,
    })
  }
  if (PaymentStatusCode === '1') {
    await sendCoins(
      userId,
      paymentAmount,
      CompletedPaymentAmount,
      MerchantTransactionID,
      SessionID,
      user.sweepstakesVerified ?? false
    )
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

const sendCoins = async (
  userId: string,
  amount: PaymentAmount,
  paidInCents: number,
  transactionId: string,
  sessionId: string,
  isSweepsVerified: boolean
) => {
  const data = { transactionId, type: 'gidx', paidInCents, sessionId }
  const pg = createSupabaseDirectClient()
  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    data,
    amount: amount.mana,
    token: 'M$',
    category: 'MANA_PURCHASE',
    description: `Deposit for mana purchase`,
  } as const

  const cashBonusTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    data,
    amount: amount.bonusInDollars,
    token: 'CASH',
    category: 'CASH_BONUS',
    description: `Bonus for mana purchase`,
  } as const

  await pg.tx(async (tx) => {
    await runTxn(tx, manaPurchaseTxn)
    if (isSweepsVerified) {
      await runTxn(tx, cashBonusTxn)
    }
    await updateUser(tx, userId, {
      purchasedMana: true,
    })
  })
}
