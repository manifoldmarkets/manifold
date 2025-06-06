import { isAdminId, isModId } from 'common/envs/constants'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { from, renderSql, select, where } from 'shared/supabase/sql-builder'
import { APIError, type AuthedUser } from './helpers/endpoint'
import { Row } from 'common/supabase/utils'

export const deleteGroup = async (
  props: { id: string } | { slug: string },
  auth: AuthedUser
) => {
  const pg = createSupabaseDirectClient()

  const whereClause = 'id' in props ? 'id = ${id}' : 'slug = ${slug}'
  const query = renderSql(
    select('*'),
    from('groups'),
    where(whereClause, props)
  )

  const group = await pg.oneOrNone<Row<'groups'>>(query)

  if (!group) {
    throw new APIError(404, 'Group not found')
  }

  log(
    `delete group ${group.name} ${group.slug} initiated by ${auth.uid}`,
    group
  )

  const id = group.id

  if (!isModId(auth.uid) && !isAdminId(auth.uid)) {
    const requester = await pg.oneOrNone(
      'select role from group_members where group_id = $1 and member_id = $2',
      [id, auth.uid]
    )

    if (requester?.role !== 'admin') {
      throw new APIError(403, 'You do not have permission to delete this group')
    }
  }

  // fail if there are contracts tagged with this group
  // we could just untag contracts like in scripts/deleteGroup.ts
  // but I don't trust the mods. I'm forcing them to manually untag or retag contracts to make them reckon with the responsibility of what deleting a group means.
  const { count: contractCount } = await pg.one(
    `select count(*) from group_contracts where group_id = $1`,
    [id]
  )

  if (contractCount > 0) {
    throw new APIError(
      400,
      `Only topics with no questions can be deleted. There are still ${contractCount} questions tagged with this topic.`
    )
  }

  await pg.tx(async (tx) => {
    log('removing group members')
    await tx.none('delete from group_members where group_id = $1', [id])
    log('deleting group ', id)
    await tx.none('delete from groups where id = $1', [id])
  })
}
