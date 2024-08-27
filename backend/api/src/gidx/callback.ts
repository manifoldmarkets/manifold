import { APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/utils'
import { getGIDXCustomerProfile } from 'shared/gidx/helpers'
import { getVerificationStatusInternal } from 'api/gidx/get-verification-status'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { broadcast } from 'shared/websockets/server'

export const identityCallbackGIDX: APIHandler<
  'identity-callback-gidx'
> = async (props) => {
  log('identity-callback-gidx', props)

  const { MerchantCustomerID } = props
  const customerProfile = await getGIDXCustomerProfile(MerchantCustomerID)
  log('CustomerProfile', customerProfile)
  return {
    result: { Accepted: true },
    continue: async () => {
      await getVerificationStatusInternal(MerchantCustomerID, customerProfile)
    },
  }
}

export const paymentCallbackGIDX: APIHandler<'payment-callback-gidx'> = async (
  props
) => {
  log('payment-callback-gidx', props)

  const {
    MerchantTransactionID,
    TransactionStatusCode,
    TransactionStatusMessage,
    StatusCode,
    SessionID,
    MerchantSessionID,
    SessionScore,
    ReasonCodes,
    ServiceType,
    StatusMessage,
  } = props

  const pg = createSupabaseDirectClient()

  await pg.none(
    `
    insert into gidx_receipts (
      merchant_transaction_id,
      transaction_status_code,
      transaction_status_message,
      status_code,
      session_id,
      merchant_session_id,
      session_score,
      reason_codes,
      service_type,
      status,
     callback_data
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
    )
  `,
    [
      MerchantTransactionID,
      TransactionStatusCode,
      TransactionStatusMessage,
      StatusCode,
      SessionID,
      MerchantSessionID,
      SessionScore,
      ReasonCodes,
      ServiceType,
      StatusMessage,
      JSON.stringify(props),
    ]
  )
  broadcast('gidx-checkout-session/' + MerchantSessionID, {
    StatusCode,
    StatusMessage,
  })
  // TODO: if cashout txn is failed, give back the mana cash

  // TODO: Double check here that the txns were sent given successful payment
  //  and if not, resend them

  return {
    Accepted: true,
  }
}
