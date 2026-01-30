import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { track } from 'shared/analytics'

const IDENFY_TOKEN_URL = 'https://ivs.idenfy.com/api/v2/token'
const IDENFY_REDIRECT_URL = 'https://ivs.idenfy.com/api/v2/redirect'

type IdenfyTokenResponse = {
  authToken: string
  scanRef: string
  clientId: string
  expiryTime: number
}

export const createIdenfySession: APIHandler<'create-idenfy-session'> = async (
  _props,
  auth
) => {
  const pg = createSupabaseDirectClient()

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  // Check if user already has a pending or approved verification
  const existingVerification = await pg.oneOrNone<{ status: string }>(
    `SELECT status FROM idenfy_verifications 
     WHERE user_id = $1 
     ORDER BY created_time DESC 
     LIMIT 1`,
    [auth.uid]
  )

  if (existingVerification?.status === 'approved') {
    throw new APIError(400, 'User is already verified')
  }

  const apiKey = process.env.IDENFY_API_KEY
  const apiSecret = process.env.IDENFY_API_SECRET

  if (!apiKey || !apiSecret) {
    log.error('iDenfy API credentials not configured')
    throw new APIError(500, 'Identity verification service not configured')
  }

  const auth64 = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  const payload = {
    clientId: auth.uid,
  }

  log('iDenfy token request for user:', auth.uid)

  const response = await fetch(IDENFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth64}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    log.error('iDenfy token request failed:', {
      status: response.status,
      body: errorText,
    })
    throw new APIError(500, 'Failed to create verification session')
  }

  const data = (await response.json()) as IdenfyTokenResponse
  log('iDenfy token response:', { scanRef: data.scanRef, clientId: data.clientId })

  if (!data.authToken || !data.scanRef) {
    log.error('iDenfy response missing required fields:', data)
    throw new APIError(500, 'Invalid response from verification service')
  }

  // Store the verification session in the database
  const verificationRow = await pg.oneOrNone<{ user_id: string }>(
    `INSERT INTO idenfy_verifications (user_id, scan_ref, auth_token, status)
     VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (scan_ref) DO UPDATE SET
       auth_token = $3,
       updated_time = NOW()
     WHERE idenfy_verifications.user_id = $1
     RETURNING user_id`,
    [auth.uid, data.scanRef, data.authToken]
  )

  if (!verificationRow) {
    log.error('iDenfy scanRef already linked to another user', {
      userId: auth.uid,
      scanRef: data.scanRef,
    })
    throw new APIError(409, 'Verification session conflict')
  }

  track(auth.uid, 'idenfy session created', { scanRef: data.scanRef })

  const redirectUrl = `${IDENFY_REDIRECT_URL}?authToken=${data.authToken}`

  return {
    redirectUrl,
    scanRef: data.scanRef,
  }
}
