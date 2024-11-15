import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { revalidateStaticProps } from 'shared/utils'
import { groupPath } from 'common/group'

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
  const continuation = async () => {
    const data = await pg.many(
      `select slug from groups where id = $1 or id = $2`,
      [topId, bottomId]
    )
    await Promise.all([
      revalidateStaticProps(groupPath(data[0].slug)),
      revalidateStaticProps(groupPath(data[1].slug)),
    ])
  }

  return {
    result: { status: 'success' },
    continue: continuation,
  }
}
