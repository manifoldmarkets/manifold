import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  updatePrivateUser as updatePrivateUserData,
  UpdateType,
} from 'shared/supabase/users'
import { FieldVal } from 'shared/supabase/utils'
import { DELETE_PUSH_TOKEN } from 'common/notification'

export const updatePrivateUser: APIHandler<'me/private/update'> = async (
  props,
  auth
) => {
  const pg = createSupabaseDirectClient()

  const updates = {
    ...props,
  } as UpdateType
  if (props.pushToken === DELETE_PUSH_TOKEN) {
    updates.pushToken = FieldVal.delete()
  }

  await updatePrivateUserData(pg, auth.uid, updates)
}
