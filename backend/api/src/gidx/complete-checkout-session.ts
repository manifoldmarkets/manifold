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
import { verifyReasonCodes } from 'api/gidx/register'
import { intersection } from 'lodash'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DirectCashier/CompleteSession'

export const completeCheckoutSession: APIHandler<
  'complete-checkout-session-gidx'
> = async (props, auth, req) => {
  if (!GIDX_REGISTATION_ENABLED)
    throw new APIError(400, 'GIDX registration is disabled')
  const userId = auth.uid
  const { phoneNumberWithCode } = await getUserRegistrationRequirements(userId)
  const { PaymentMethod, MerchantSessionID, ...rest } = props
  const { creditCard, Type, BillingAddress, NameOnAccount, SavePaymentMethod } =
    PaymentMethod
  if (Type === 'CC' && !creditCard) {
    throw new APIError(400, 'Must include credit card information')
  }
  const body = {
    ...rest,
    SavePaymentMethod,
    PaymentMethod: {
      Type,
      NameOnAccount,
      ...creditCard,
      PhoneNumber: phoneNumberWithCode,
    },
    BillingAddress,
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
    ReasonCodes,
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

  const { PaymentStatusCode, PaymentStatusMessage } = PaymentDetails[0]
  if (PaymentStatusCode === '1') {
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
  const { status, message } = await verifyReasonCodes(
    auth.uid,
    ReasonCodes,
    undefined,
    undefined
  )
  if (status === 'error') {
    return {
      status,
      message,
    }
  }

  return {
    status,
    message,
  }
}

export const verifyPaymentReasonCodes = async (ReasonCodes: string[]) => {
  const hasAny = (codes: string[]) =>
    intersection(codes, ReasonCodes).length > 0

  // High volume of payments with matching amounts to multiple merchants
  if (hasAny(['PAY-HV-MA-QMX'])) {
    return {
      status: 'warning',
      message:
        'High volume of matching payments to multiple merchants detected.',
    }
  }

  // High volume of payments from multiple customers/IPs to matching merchants
  if (hasAny(['PAY-HV-CLX-IP'])) {
    return {
      status: 'warning',
      message:
        'High volume of payments from multiple sources to matching merchants detected.',
    }
  }

  // High volume of payments matching previous amounts
  if (hasAny(['PAY-HV-MA-PRV-A'])) {
    return {
      status: 'warning',
      message: 'High volume of payments matching previous amounts detected.',
    }
  }

  // High volume of payments to one merchant using multiple methods
  if (hasAny(['PAY-HV-OM1-CL1-MTHD'])) {
    return {
      status: 'warning',
      message:
        'High volume of payments to one merchant using multiple methods detected.',
    }
  }

  // Same payment method used by multiple customers
  if (hasAny(['PAY-MTHD1-CLX'])) {
    return {
      status: 'warning',
      message: 'Same payment method used by multiple customers.',
    }
  }

  // Payment manually cancelled by customer
  if (hasAny(['PAY-CNCL'])) {
    return {
      status: 'info',
      message: 'Payment cancelled by customer.',
    }
  }

  // High velocity payments by different customer types
  if (hasAny(['PAY-HVEL-CL', 'PAY-HVEL-CKI', 'PAY-HVEL-CKE'])) {
    let customerType = 'customer'
    if (ReasonCodes.includes('PAY-HVEL-CKI'))
      customerType = 'Fully KYC (Internally) Customer'
    if (ReasonCodes.includes('PAY-HVEL-CKE'))
      customerType = 'KYC Vouched (Externally) Customer'
    return {
      status: 'warning',
      message: `High velocity of payments detected for ${customerType}.`,
    }
  }

  // High velocity payments by operator/merchant
  if (hasAny(['PAY-HVEL-OM'])) {
    return {
      status: 'warning',
      message: 'High velocity of payments detected for operator/merchant.',
    }
  }

  // Payment needs manual approval
  if (hasAny(['PAY-MANUAL'])) {
    return {
      status: 'info',
      message: 'Payment requires manual approval from merchant.',
    }
  }

  // If no specific codes matched
  return {
    status: 'success',
    message: 'Payment verified successfully.',
  }
}
