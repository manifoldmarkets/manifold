import { APIError, APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isProd } from 'shared/utils'
import { rateLimitByUser } from './helpers/rate-limit'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const twilio = require('twilio')

export const requestOTP: APIHandler<'request-otp'> = rateLimitByUser(
  async (props, auth) => {
    const pg = createSupabaseDirectClient()
    const { phoneNumber } = props
    const userHasPhoneNumber = await pg.oneOrNone(
      `select phone_number from private_user_phone_numbers where user_id = $1
            or phone_number = $2
            limit 1
            `,
      [auth.uid, phoneNumber]
    )
    if (userHasPhoneNumber && isProd()) {
      throw new APIError(400, 'User verified phone number already.')
    }
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const client = new twilio(process.env.TWILIO_SID, authToken)
    try {
      const newVerification = await client.verify.v2
        .services(process.env.TWILIO_VERIFY_SID)
        .verifications.create({ to: phoneNumber, channel: 'sms' })
      log(newVerification.status, { phoneNumber })
    } catch (e) {
      log(e)
      throw new APIError(400, e as string)
    }

    return { status: 'success' }
  }
)
