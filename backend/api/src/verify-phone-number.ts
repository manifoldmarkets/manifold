import { APIError, APIHandler, AuthedUser } from 'api/helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { getPrivateUser, getUser, log } from 'shared/utils'
import { PHONE_VERIFICATION_BONUS, SUS_STARTING_BALANCE } from 'common/economy'
import { SignupBonusTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { rateLimitByUser } from './helpers/rate-limit'
import { updateUser } from 'shared/supabase/users'
import { HOUR_MS } from 'common/util/time'
import { canReceiveBonuses } from 'common/user'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const twilio = require('twilio')

export const verifyPhoneNumber: APIHandler<'verify-phone-number'> =
  rateLimitByUser(
    async (props, auth) => {
      const pg = createSupabaseDirectClient()
      const { phoneNumber, code: otpCode } = props

      log('verifyPhoneNumber', {
        phoneNumber,
        code: otpCode,
      })
      // Special handling for verified phone number
      if (phoneNumber === process.env.VERIFIED_PHONE_NUMBER) {
        await pg.tx(async (tx) => {
          await handlePhoneVerification(tx, auth, phoneNumber, true)
        })
        return { status: 'success' }
      }

      await pg.tx(async (tx) => {
        const userHasPhoneNumber = await tx.oneOrNone(
          `select phone_number from private_user_phone_numbers where user_id = $1
            or phone_number = $2
            limit 1
            `,
          [auth.uid, phoneNumber]
        )
        if (userHasPhoneNumber) {
          throw new APIError(400, 'User verified phone number already.')
        }

        const authToken = process.env.TWILIO_AUTH_TOKEN
        const client = new twilio(process.env.TWILIO_SID, authToken)
        const lookup = await client.lookups.v2
          .phoneNumbers(phoneNumber)
          .fetch({ fields: 'line_type_intelligence' })
        if (
          lookup.lineTypeIntelligence.type !== 'mobile' &&
          lookup.lineTypeIntelligence.type !== null &&
          lookup.countryCode !== 'CA'
        ) {
          throw new APIError(400, 'Only mobile carriers allowed')
        }

        const verification = await client.verify.v2
          .services(process.env.TWILIO_VERIFY_SID)
          .verificationChecks.create({ to: phoneNumber, code: otpCode })
        if (verification.status !== 'approved') {
          throw new APIError(400, 'Invalid code. Please try again.')
        }

        log(verification.status, { phoneNumber, otpCode })
        await handlePhoneVerification(tx, auth, phoneNumber, false)
      })

      return { status: 'success' }
    },
    { maxCalls: 10, windowMs: 6 * HOUR_MS }
  )

async function handlePhoneVerification(
  tx: SupabaseTransaction,
  auth: AuthedUser,
  phoneNumber: string,
  shouldDeleteExisting: boolean
) {
  if (shouldDeleteExisting) {
    // Delete any existing phone number for this user
    await tx.none(
      `delete from private_user_phone_numbers where phone_number = $1`,
      [phoneNumber]
    )
    log(`Deleted existing phone number for user ${auth.uid}`)
  }

  // Insert the new phone number
  await tx.none(
    `insert into private_user_phone_numbers (user_id, phone_number) values ($1, $2)
      on conflict (user_id) do nothing`,
    [auth.uid, phoneNumber]
  )

  const privateUser = await getPrivateUser(auth.uid, tx)
  if (!privateUser)
    throw new APIError(401, `Private user ${auth.uid} not found`)

  const user = await getUser(auth.uid, tx)
  if (!user) throw new APIError(401, `User ${auth.uid} not found`)

  const { verifiedPhone } = user
  if (!verifiedPhone) {
    await updateUser(tx, auth.uid, {
      verifiedPhone: true,
    })

    // Only pay phone verification bonus if user can receive bonuses (verified or grandfathered)
    if (canReceiveBonuses(user)) {
      const isPrivateUserWithMatchingDeviceToken = async (
        deviceToken: string
      ) => {
        const data = await tx.oneOrNone(
          `select 1 from private_users where (data->'initialDeviceToken')::text = $1 and id != $2`,
          [deviceToken, auth.uid]
        )
        return !!data
      }

      const { initialDeviceToken: deviceToken } = privateUser
      const deviceUsedBefore =
        !deviceToken || (await isPrivateUserWithMatchingDeviceToken(deviceToken))

      const amount = deviceUsedBefore
        ? SUS_STARTING_BALANCE
        : PHONE_VERIFICATION_BONUS

      const signupBonusTxn: Omit<
        SignupBonusTxn,
        'fromId' | 'id' | 'createdTime'
      > = {
        fromType: 'BANK',
        amount,
        category: 'SIGNUP_BONUS',
        toId: auth.uid,
        token: 'M$',
        toType: 'USER',
        description: 'Phone number verification bonus',
      }
      await runTxnFromBank(tx, signupBonusTxn)
      log(`Sent phone verification bonus to user ${auth.uid}`)
    } else {
      log(`Skipped phone verification bonus for user ${auth.uid} - not eligible for bonuses`)
    }
  }
}
