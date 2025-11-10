import { isAdminId, isModId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { followUserInternal } from './follow-user'
import { APIError, APIHandler } from './helpers/endpoint'

export const blockUser: APIHandler<'user/by-id/:id/block'> = async (
  { id },
  auth
) => {
  if (auth.uid === id) throw new APIError(400, 'You cannot block yourself')
  if (isAdminId(id) || isModId(id)) {
    throw new APIError(400, 'You cannot block an admin or mod')
  }
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
