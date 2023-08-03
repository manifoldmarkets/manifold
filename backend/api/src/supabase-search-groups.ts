import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, Json, MaybeAuthedEndpoint, validate } from './helpers'
import { convertGroup } from 'common/supabase/groups'

const SIMILARITY_THRESHOLD = 0.2

const bodySchema = z.object({
  term: z.string(),
  offset: z.number().gte(0),
  limit: z.number().gt(0),
  fuzzy: z.boolean().optional(),
  yourGroups: z.boolean().optional(),
  addingToContract: z.boolean().optional(),
  newContract: z.boolean().optional(),
})

export const supabasesearchgroups = MaybeAuthedEndpoint(async (req, auth) => {
  const {
    term,
    offset,
    limit,
    fuzzy,
    yourGroups,
    addingToContract,
    newContract,
  } = validate(bodySchema, req.body)
  const pg = createSupabaseDirectClient()
  const searchGroupSQL = getSearchGroupSQL({
    term,
    offset,
    limit,
    fuzzy,
    yourGroups,
    uid: auth?.uid,
    addingToContract,
    newContract,
  })
  const groups = await pg.map(searchGroupSQL, [term], convertGroup)

  return (groups ?? []) as unknown as Json
})

function getSearchGroupSQL(groupInput: {
  term: string
  offset: number
  limit: number
  fuzzy?: boolean
  yourGroups?: boolean
  uid?: string
  addingToContract?: boolean
  newContract?: boolean
}) {
  const {
    term,
    offset,
    limit,
    fuzzy,
    yourGroups,
    uid,
    addingToContract,
    newContract,
  } = groupInput

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

  function getAddingToContractWhereSQL(groupTable: string) {
    const curatedModeratorWhereSQL = uid
      ? `or has_moderator_or_above_role(${groupTable}.id, '${uid}'))`
      : ')'

    const newContractWhereSQL = newContract
      ? ''
      : `and privacy_status != 'private'`
    return addingToContract
      ? `and (privacy_status!='curated' ${curatedModeratorWhereSQL} ${newContractWhereSQL}`
      : ''
  }

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
      select * from (
        select groups.*,
        group_members.created_time as created from groups
        join group_members on group_members.group_id = groups.id
        where group_members.member_id = '${uid}'
      ) as groupz
      order by created desc
      `
    }
    // if search is fuzzy
    else if (fuzzy) {
      query = `
      select *
      from (
        select groups.*, similarity(groups.name,$1) AS similarity_score
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
      select groups.*
        from groups 
        join group_members 
        on groups.id = group_members.group_id,
        websearch_to_tsquery('english',  $1) as query
      where group_members.member_id = '${uid}'
      and groups.name_fts @@ query
      `
    }
    // if in discover groups or adding to contract
  } else {
    if (emptyTerm) {
      query = `
        select *
        from groups
        ${discoverGroupSearchWhereSQL('groups')}
        ${getAddingToContractWhereSQL('groups')}
        ${discoverGroupOrderBySQL}
      `
    }
    // if search is fuzzy
    else if (fuzzy) {
      query = `
      SELECT groupz.*
      FROM (
        SELECT groups.*,
            similarity(groups.name,$1) AS similarity_score
        FROM groups 
      ) AS groupz
       ${discoverGroupSearchWhereSQL('groupz')}
      ${getAddingToContractWhereSQL('groupz')}
      and groupz.similarity_score > ${SIMILARITY_THRESHOLD}
      ${discoverGroupOrderBySQL}
      `
    } else {
      query = `
        select groups.*
        FROM groups,
        websearch_to_tsquery('english',  $1) as query
       ${discoverGroupSearchWhereSQL('groups')}
        ${getAddingToContractWhereSQL('groups')}
        and groups.name_fts @@ query
        ${discoverGroupOrderBySQL}
      `
    }
  }
  return query + `LIMIT ${limit} OFFSET ${offset}`
}
