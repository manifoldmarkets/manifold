import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  ENABLE_FAKE_CUSTOMER,
  FAKE_CUSTOMER_BODY,
  GIDXMonitorResponse,
} from 'common/gidx/gidx'
import { getIp, track } from 'shared/analytics'
import {
  getGIDXStandardParams,
  getLocalServerIP,
  GIDX_BASE_URL,
  throwIfIPNotWhitelisted,
  verifyReasonCodes,
} from 'shared/gidx/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUserAndPrivateUserOrThrow, LOCAL_DEV, log } from 'shared/utils'

export const getMonitorStatus: APIHandler<'get-monitor-status-gidx'> = async (
  props,
  auth,
  req
) => {
  const userId = auth.uid
  const pg = createSupabaseDirectClient()
  const userAndPrivateUser = await getUserAndPrivateUserOrThrow(userId, pg)

  const ENDPOINT = GIDX_BASE_URL + '/v3.0/api/CustomerIdentity/CustomerMonitor'
  const body = {
    MerchantCustomerID: userId,
    DeviceIpAddress: ENABLE_FAKE_CUSTOMER
      ? FAKE_CUSTOMER_BODY.DeviceIpAddress
      : LOCAL_DEV
      ? await getLocalServerIP()
      : getIp(req),
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

  const { ApiKey: _, ...dataToLog } = data
  log('Monitor response:', dataToLog)
  await pg.none(
    'insert into user_monitor_status (user_id, data, reason_codes, fraud_confidence_score, identity_confidence_score) values ($1, $2, $3, $4, $5)',
    [
      userId,
      dataToLog,
      data.ReasonCodes,
      data.FraudConfidenceScore,
      data.IdentityConfidenceScore,
    ]
  )
  throwIfIPNotWhitelisted(data.ResponseCode, data.ResponseMessage)
  const { status, message } = await verifyReasonCodes(
    userAndPrivateUser,
    data.ReasonCodes,
    data.FraudConfidenceScore,
    data.IdentityConfidenceScore
  )
  track(auth.uid, 'gidx monitor status', {
    status,
    message,
    fraudScore: data.FraudConfidenceScore,
    userId: auth.uid,
  })
  return {
    status,
    message,
  }
}
