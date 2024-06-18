import { APIHandler } from './helpers/endpoint'
import { followUserInternal } from './follow-user'
import { FieldVal } from 'shared/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'

export const blockUser: APIHandler<'user/by-id/:id/block'> = async (
  { id },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await pg.tx(async (tx) => {
    await updatePrivateUser(tx, auth.uid, {
      blockedUserIds: FieldVal.arrayConcat(id),
    })
    await updatePrivateUser(tx, id, {
      blockedByUserIds: FieldVal.arrayConcat(auth.uid),
    })
  })

  await followUserInternal(auth.uid, id, false)
}

export const unblockUser: APIHandler<'user/by-id/:id/unblock'> = async (
  { id },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await pg.tx(async (tx) => {
    await updatePrivateUser(tx, auth.uid, {
      blockedUserIds: FieldVal.arrayRemove(id),
    })
    await updatePrivateUser(tx, id, {
      blockedByUserIds: FieldVal.arrayRemove(auth.uid),
    })
  })
}
