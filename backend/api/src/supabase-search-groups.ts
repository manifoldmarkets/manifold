import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, Json, MaybeAuthedEndpoint, validate } from './helpers'
import { FIRESTORE_DOC_REF_ID_REGEX } from './supabase-search-contract'
import { Group } from 'common/group'

const SIMILARITY_THRESHOLD = 0.2

const bodySchema = z.object({
  term: z.string(),
  offset: z.number().gte(0),
  limit: z.number().gt(0),
  fuzzy: z.boolean().optional(),
  yourGroups: z.boolean().optional(),
})

export const supabasesearchgroups = MaybeAuthedEndpoint(async (req, auth) => {
  const { term, offset, limit, fuzzy, yourGroups } = validate(
    bodySchema,
    req.body
  )
  const pg = createSupabaseDirectClient()
  const searchGroupSQL = getSearchGroupSQL({
    term,
    offset,
    limit,
    fuzzy,
    yourGroups,
    uid: auth?.uid,
  })
  console.log(searchGroupSQL)
  const groups = await pg.map(searchGroupSQL, [term], (r) => r.data as Group)

  return (groups ?? []) as unknown as Json
})

function getSearchGroupSQL(groupInput: {
  term: string
  offset: number
  limit: number
  fuzzy?: boolean
  yourGroups?: boolean
  uid?: string
}) {
  const { term, offset, limit, fuzzy, yourGroups, uid } = groupInput

  let query = ''
  const emptyTerm = term.length === 0

  // make sure when perusing groups, only non private ones are shown
  function discoverGroupSearchWhereSQL(groupTable: string) {
    const privateGroupWhereSQL = uid
      ? `or is_group_member(${groupTable}.id,'${uid}') or is_admin('${uid}'))`
      : ')'
    return `where (privacy_status != 'private' ${privateGroupWhereSQL}`
  }
  const discoverGroupOrderBySQL = 'order by total_members desc'

  // if looking for your own groups
  if (yourGroups) {
    // if user is not the same user groups
    if (!uid) {
      throw new APIError(401, 'You must be logged in to see your groups')
    }
    // if no term, shows users groups in order of when they joined
    // exclude your own groups, because it will be shown above
    if (emptyTerm) {
      query = `
      select groupz.data from (
        select groups.data as data,
        group_members.data as gm_data from groups
        join group_members on group_members.group_id = groups.id
        where group_members.member_id = '${uid}'
      ) as groupz
      order by groupz.gm_data->>'createdTime' desc
      `
    }
    // if search is fuzzy
    else if (fuzzy) {
      query = `
      select groupz.data
      from (
        select groups.*,
            similarity(groups.name,$1) AS similarity_score
        FROM groups 
        join group_members 
        on groups.id = group_members.group_id
        where group_members.member_id = '${uid}'
      ) AS groupz
      where
      groupz.similarity_score > ${SIMILARITY_THRESHOLD}
      `
    } else {
      query = `
      select groups.data
        from groups 
        join group_members 
        on groups.id = group_members.group_id,
        websearch_to_tsquery('english',  $1) as query
      where group_members.member_id = '${uid}'
      and groups.name_fts @@ query
      `
    }
    // if in discover groups
  } else {
    if (emptyTerm) {
      query = `
        select data
        from groups
        ${discoverGroupSearchWhereSQL('groups')}
        ${discoverGroupOrderBySQL}
      `
    }
    // if search is fuzzy
    else if (fuzzy) {
      query = `
      SELECT groupz.data
      FROM (
        SELECT groups.*,
            similarity(groups.name,$1) AS similarity_score
        FROM groups 
      ) AS groupz
       ${discoverGroupSearchWhereSQL('groupz')}
      and groupz.similarity_score > ${SIMILARITY_THRESHOLD}
      ${discoverGroupOrderBySQL}
      `
    } else {
      query = `
        SELECT groups.*
        FROM groups,
        websearch_to_tsquery('english',  $1) as query
       ${discoverGroupSearchWhereSQL('groups')}
        and groups.name_fts @@ query
        ${discoverGroupOrderBySQL}
      `
    }
  }
  return query + `LIMIT ${limit} OFFSET ${offset}`
}
