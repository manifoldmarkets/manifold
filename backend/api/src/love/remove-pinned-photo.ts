import { APIError } from 'api/helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { type APIHandler } from 'api/helpers'
import { isAdminId } from 'common/envs/constants'

export const removePinnedPhoto: APIHandler<'remove-pinned-photo'> = async (
  body: { userId: string },
  auth,
  { log }
) => {
  const { userId } = body
  log('remove pinned url', { userId })

  if (!isAdminId(auth.uid))
    throw new APIError(403, 'Only admins can remove pinned photo')

  const db = createSupabaseClient()
  await db.from('lovers').update({ pinned_url: null }).eq('user_id', userId)

  return {
    success: true,
  }
}
