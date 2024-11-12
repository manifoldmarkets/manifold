import { uniqBy } from 'lodash'
import { type APIHandler } from './helpers/endpoint'
import { convertGroup } from 'common/supabase/groups'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  limit as limitClause,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'

export const getGroups: APIHandler<'groups'> = async (props) => {
  const { availableToUserId, beforeTime, limit } = props
  const pg = createSupabaseDirectClient()
  const publicGroups = await pg.map(
    renderSql(
      select('*'),
      from('groups'),
      where('privacy_status', 'public'),
      beforeTime && where('created_time < ts_to_millis($1)', [beforeTime]),
      orderBy('created_time', 'desc'),
      limitClause(limit)
    ),
    [],
    convertGroup
  )

  if (availableToUserId) {
    const memberGroups = await pg.map(
      `
      select * from groups
      where id in (
        select group_id from group_members
        where member_id = $1
      )
      `,
      [availableToUserId],
      convertGroup
    )
    return uniqBy(memberGroups.concat(publicGroups), 'id')
  } else {
    return publicGroups
  }
}
