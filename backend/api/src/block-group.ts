import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { FieldVal } from 'shared/supabase/utils'
import { updatePrivateUser } from 'shared/supabase/users'

export const blockGroup: APIHandler<'group/:slug/block'> = async (
  { slug },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await updatePrivateUser(pg, auth.uid, {
    blockedGroupSlugs: FieldVal.arrayConcat(slug),
  })
}

export const unblockGroup: APIHandler<'group/:slug/unblock'> = async (
  { slug },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await updatePrivateUser(pg, auth.uid, {
    blockedGroupSlugs: FieldVal.arrayRemove(slug),
  })
}
