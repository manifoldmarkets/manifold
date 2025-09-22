import { convertGroup } from 'common/supabase/groups'
import { uniqBy } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  limit as limitClause,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { type APIHandler } from './helpers/endpoint'

export const getGroups: APIHandler<'groups'> = async (props) => {
  const { availableToUserId, beforeTime, limit } = props
  const pg = createSupabaseDirectClient()
  const publicGroups = await pg.map(
    renderSql(
      select('*'),
      from('groups'),
      where('privacy_status = $1', ['public']),
      beforeTime && where('created_time < millis_to_ts($1)', [beforeTime]),
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
