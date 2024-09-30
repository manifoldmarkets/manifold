import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { millisToTs } from 'common/supabase/utils'
import { isAdminId } from 'common/envs/constants'
import { insert } from 'shared/supabase/utils'

export const createManalink: APIHandler<'manalink'> = async (props, auth) => {
  const { amount, expiresTime, maxUses, message } = props
  if (!isAdminId(auth.uid)) {
    throw new APIError(
      403,
      `User ${auth.uid} must be an admin to perform this action.`
    )
  }

  const pg = createSupabaseDirectClient()
  const data = await insert(pg, 'manalinks', {
    amount,
    creator_id: auth.uid,
    max_uses: maxUses,
    expires_time: expiresTime ? millisToTs(expiresTime) : undefined,
    message,
  })

  return { slug: data.id }
}
