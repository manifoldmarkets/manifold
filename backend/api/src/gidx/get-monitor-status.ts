import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { GIDXMonitorResponse } from 'common/gidx/gidx'
import { getUser, log } from 'shared/utils'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { getIp } from 'shared/analytics'
import { verifyReasonCodes } from 'api/gidx/register'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'

export const getMonitorStatus: APIHandler<'get-monitor-status-gidx'> = async (
  props,
  auth,
  req
) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const userId = auth.uid
  const pg = createSupabaseDirectClient()
  const user = await getUser(userId, pg)
  if (!user) {
    return {
      status: 'error',
      message: 'User not found',
    }
  }
  if (user.idStatus !== 'verified') {
    return {
      status: 'error',
      message: 'User must pass kyc first',
    }
  }
  await getUserRegistrationRequirements(userId)
  const ENDPOINT =
    'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerMonitor'
  const body = {
    MerchantCustomerID: userId,
    DeviceIPAddress: getIp(req),
    ...props,
    ...getGIDXStandardParams(),
  }
  log('Monitor request body:', body)

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new APIError(400, 'GIDX monitor status failed')
  }

  const data = (await res.json()) as GIDXMonitorResponse
  log('Monitor response:', data)
  const { status, message } = await verifyReasonCodes(
    userId,
    data.ReasonCodes,
    data.FraudConfidenceScore,
    data.IdentityConfidenceScore
  )

  if (status === 'success' && user.kycStatus !== 'verified') {
    await updateUser(pg, auth.uid, {
      kycStatus: 'verified',
    })
  }
  return {
    status,
    message,
  }
}
