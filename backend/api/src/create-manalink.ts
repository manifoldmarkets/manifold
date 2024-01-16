import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { millisToTs } from 'common/supabase/utils'

export const createManalink: APIHandler<'manalink'> = async (props, auth) => {
  const { amount, expiresTime, maxUses, message } = props

  const db = createSupabaseClient()
  const { data, error } = await db
    .from('manalinks')
    .insert({
      amount,
      creator_id: auth.uid,
      max_uses: maxUses,
      expires_time: expiresTime ? millisToTs(expiresTime) : undefined,
      message,
    })
    .select('id')
    .single()

  if (error)
    throw new APIError(500, 'failed to create manalink: ' + error.message)

  return { slug: data.id }
}
