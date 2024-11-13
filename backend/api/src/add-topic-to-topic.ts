import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'

export const addOrRemoveTopicFromTopic: APIHandler<
  'group/by-id/:topId/group/:bottomId'
> = async (props, auth) => {
  const { topId, bottomId, remove } = props

  const pg = createSupabaseDirectClient()

  if (!isModId(auth.uid) && !isAdminId(auth.uid)) {
    throw new APIError(
      403,
      'You do not have permission to update group relationships'
    )
  }

  if (remove) {
    await pg.none(
      `delete from group_groups where top_id = $1 and bottom_id = $2`,
      [topId, bottomId]
    )
  } else {
    await pg.none(
      `insert into group_groups (top_id, bottom_id) values ($1, $2)`,
      [topId, bottomId]
    )
  }
}
