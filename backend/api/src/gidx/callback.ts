import { APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/utils'
import { getGIDXCustomerProfile } from 'shared/gidx/helpers'
import { getVerificationStatusInternal } from 'api/gidx/get-verification-status'

export const callbackGIDX: APIHandler<'callback-gidx'> = async (props) => {
  log('callback-gidx', props)

  const { MerchantCustomerID } = props
  const customerProfile = await getGIDXCustomerProfile(MerchantCustomerID)
  log('CustomerProfile', customerProfile)
  return {
    Accepted: true,
    continue: async () => {
      await getVerificationStatusInternal(MerchantCustomerID, customerProfile)
    },
  }
}
