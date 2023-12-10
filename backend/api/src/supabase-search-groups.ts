import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'
import { convertGroup } from 'common/supabase/groups'
import {
  renderSql,
  select,
  from,
  limit,
  orderBy,
  where,
} from 'shared/supabase/sql-builder'
import { constructPrefixTsQuery } from 'shared/helpers/search'

const bodySchema = z
  .object({
    term: z.string(),
    offset: z.number().gte(0).default(0),
    limit: z.number().gt(0),
    addingToContract: z.boolean().optional(),
  })
  .strict()

export const supabasesearchgroups = MaybeAuthedEndpoint(async (req, auth) => {
  const { term, offset, limit, addingToContract } = validate(
    bodySchema,
    req.body
  )

  const pg = createSupabaseDirectClient()
  const uid = auth?.uid

  const searchGroupSQL = getSearchGroupSQL({
    term,
    offset,
    limit,
    uid,
    addingToContract,
  })

  const groups = await pg.map(searchGroupSQL, [], convertGroup)

  return (groups ?? []) as unknown as Json
})

function getSearchGroupSQL(props: {
  term: string
  offset: number
  limit: number
  uid?: string
  addingToContract?: boolean
}) {
  const { term, uid, addingToContract } = props

  return renderSql(
    select('*'),
    from('groups'),
    where(
      `privacy_status != 'private' or is_group_member(id, $1) or is_admin($1)`,
      [uid]
    ),

    addingToContract &&
      where(
        `privacy_status != 'curated' or has_moderator_or_above_role(id, $1)`,
        [uid]
      ),

    term
      ? [
          where(
            `name_fts @@ websearch_to_tsquery('english', $1)
             or name_fts @@ to_tsquery('english', $2)`,
            [term, constructPrefixTsQuery(term)]
          ),
          orderBy('importance_score desc'),
        ]
      : !uid
      ? orderBy('importance_score desc')
      : orderBy(
          `importance_score * (CASE WHEN is_group_member(id, '${uid}') THEN 1 ELSE 0.5 END) desc`
        ),

    limit(props.limit, props.offset)
  )
}
