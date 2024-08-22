import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  CompleteSessionDirectCashierResponse,
  GIDX_REGISTATION_ENABLED,
} from 'common/gidx/gidx'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { log } from 'shared/monitoring/log'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxn } from 'shared/txn/run-txn'
import {
  GIDX_MANA_TO_PRICES,
  GIDXManaAmount,
  MANA_TO_CASH_BONUS,
} from 'common/economy'
import { getIp } from 'shared/analytics'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DirectCashier/CompleteSession'

const getManaAmountForWebPrice = (price: number) => {
  const manaAmount = Object.entries(GIDX_MANA_TO_PRICES).find(
    ([, p]) => p === price
  )
  if (!manaAmount) {
    throw new APIError(400, 'Invalid price')
  }
  return parseInt(manaAmount[0]) as GIDXManaAmount
}

export const completeCheckoutSession: APIHandler<
  'complete-checkout-session-gidx'
> = async (props, auth, req) => {
  if (!GIDX_REGISTATION_ENABLED)
    throw new APIError(400, 'GIDX registration is disabled')
  const userId = auth.uid
  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)
  const {
    PaymentMethod,
    MerchantSessionID,
    PaymentAmount,
    MerchantTransactionID,
  } = props
  const manaAmount = getManaAmountForWebPrice(
    (PaymentAmount.PaymentAmount * 100) as any
  )

  const { creditCard, Type, BillingAddress, NameOnAccount, SavePaymentMethod } =
    PaymentMethod
  if (Type === 'CC' && !creditCard) {
    throw new APIError(400, 'Must include credit card information')
  }
  const body = {
    PaymentAmount,
    DeviceIpAddress: getIp(req),
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
  log('complete checkout session body:', body)

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
  } = data
  if (SessionStatusCode === 1) {
    return {
      status: 'error',
      message: 'Your information could not be succesfully validated',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode === 2) {
    return {
      status: 'error',
      message: 'Your information is incomplete',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode === 3 && AllowRetry) {
    return {
      status: 'error',
      message: 'Payment timeout, please try again',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode === 3 && !AllowRetry) {
    return {
      status: 'error',
      message: 'Payment timeout',
      gidxMessage: SessionStatusMessage,
    }
  } else if (SessionStatusCode >= 4) {
    return {
      status: 'pending',
      message: 'Please complete next step',
      gidxMessage: SessionStatusMessage,
    }
  }

  const {
    PaymentStatusCode,
    PaymentStatusMessage,
    PaymentAmount: CompletedPaymentAmount,
  } = PaymentDetails[0]
  if (CompletedPaymentAmount !== PaymentAmount.PaymentAmount) {
    log.error('Payment amount mismatch', {
      CompletedPaymentAmount,
      PaymentAmount,
    })
  }
  if (PaymentStatusCode === '1') {
    await sendCoins(
      userId,
      manaAmount,
      CompletedPaymentAmount,
      MerchantTransactionID
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
  manaAmount: GIDXManaAmount,
  paidInCents: number,
  transactionId: string
) => {
  const data = { transactionId, type: 'gidx', paidInCents }
  const pg = createSupabaseDirectClient()
  const manaPurchaseTxn = {
    fromId: 'EXTERNAL',
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    data,
    amount: manaAmount,
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
    amount: MANA_TO_CASH_BONUS[manaAmount],
    token: 'CASH',
    category: 'CASH_BONUS',
    description: `Bonus for mana purchase`,
  } as const

  await pg.tx(async (tx) => {
    await runTxn(tx, manaPurchaseTxn)
    await runTxn(tx, cashBonusTxn)
    await updateUser(tx, userId, {
      purchasedMana: true,
    })
  })
}
