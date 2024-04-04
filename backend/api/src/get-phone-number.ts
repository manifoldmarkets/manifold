import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getPhoneNumber: APIHandler<'phone-number'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()

  const number = await pg.oneOrNone(
    `select phone_number from private_user_phone_numbers where user_id = $1`,
    [auth.uid],
    (r) => r?.phone_number as string
  )
  if (!number) {
    throw new APIError(400, 'User does not have a phone number')
  }

  return { number }
}
