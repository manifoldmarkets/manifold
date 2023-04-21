import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'

const FIRESTORE_DOC_REF_ID_REGEX = /^[a-zA-Z0-9_-]{1,}$/

const bodySchema = z.object({
  term: z.string(),
  filter: z.union([
    z.literal('open'),
    z.literal('closed'),
    z.literal('resolved'),
    z.literal('all'),
  ]),
  sort: z.union([
    z.literal('relevance'),
    z.literal('newest'),
    z.literal('score'),
    z.literal('daily-score'),
    z.literal('24-hour-vol'),
    z.literal('most-popular'),
    z.literal('liquidity'),
    z.literal('last-updated'),
    z.literal('close-date'),
    z.literal('resolve-date'),
  ]),
  offset: z.number().gte(0),
  limit: z.number().gt(0),
  fuzzy: z.boolean().optional(),
  groupId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
  creatorId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
})

export const supabasesearchcontracts = MaybeAuthedEndpoint(
  async (req, auth) => {
    const uid = auth?.uid ?? undefined
    const { term, filter, sort, offset, limit, fuzzy, groupId, creatorId } =
      validate(bodySchema, req.body)
    const pg = createSupabaseDirectClient()
    const searchMarketSQL = getSearchContractSQL({
      term,
      filter,
      sort,
      offset,
      limit,
      fuzzy,
      groupId,
      creatorId,
      uid: auth?.uid,
    })
    const contracts = await pg.map(
      searchMarketSQL,
      [term],
      (r) => r.data as Contract
    )
    return (contracts as unknown as Json) ?? ([] as unknown as Json)
  }
)

function getSearchContractSQL(contractInput: {
  term: string
  filter: string
  sort: string
  offset: number
  limit: number
  fuzzy?: boolean
  groupId?: string
  creatorId?: string
  uid?: string
}) {
  const { term, filter, sort, offset, limit, fuzzy, groupId, creatorId, uid } =
    contractInput
  let query = ''
  const emptyTerm = term.length === 0
  const whereSQL = getSearchContractWhereSQL(filter, sort, creatorId, uid)
  if (groupId) {
    if (emptyTerm) {
      query = `
        SELECT contractz.data
        FROM (
          select contracts.*, 
          group_contracts.group_id 
          from contracts 
          join group_contracts 
          on group_contracts.contract_id = contracts.id) 
        as contractz
        ${whereSQL}
        AND contractz.group_id = '${groupId}'`
    }
    // if fuzzy search within group
    else if (fuzzy) {
      query = `
        SELECT contractz.data
        FROM (
            SELECT contracts.*,
                similarity(contracts.question, $1) AS similarity_score,
                group_contracts.group_id
            FROM contracts 
            join group_contracts 
            on group_contracts.contract_id = contracts.id
        ) AS contractz
      ${whereSQL}
      AND contractz.similarity_score > 0.1
      AND contractz.group_id = '${groupId}'`
    } else {
      // if full text search within group
      query = `
        SELECT contractz.data
        FROM (
            select contracts.*, group_contracts.group_id 
            from contracts 
            join group_contracts on group_contracts.contract_id = contracts.id
        ) as contractz,
        websearch_to_tsquery(' english ', $1) query
            ${whereSQL}
        AND contractz.question_fts @@ query
        AND contractz.group_id = '${groupId}'`
    }
  } else {
    if (emptyTerm) {
      query = `
      SELECT contracts.data
      FROM contracts 
      ${whereSQL}`
    } else if (fuzzy) {
      query = `
      SELECT contractz.data
      FROM (
        SELECT contracts.*,
               similarity(contracts.question, $1) AS similarity_score
        FROM contracts
      ) AS contractz
      ${whereSQL}
      AND contractz.similarity_score > 0.1`
    } else {
      query = `
      SELECT contracts.data
      FROM contracts, websearch_to_tsquery('english',  $1) query
         ${whereSQL}
      AND contracts.question_fts @@ query`
    }
  }
  return (
    query +
    ' ' +
    getSearchContractSortSQL(sort, fuzzy, emptyTerm) +
    ' ' +
    `LIMIT ${limit} OFFSET ${offset}`
  )
}

function getSearchContractWhereSQL(
  filter: string,
  sort: string,
  creatorId: string | undefined,
  uid: string | undefined
) {
  type FilterSQL = Record<string, string>
  const filterSQL: FilterSQL = {
    open: 'resolution_time IS NULL AND close_time > NOW()',
    closed: 'close_time < NOW() AND resolution_time IS NULL',
    resolved: 'resolution_time IS NOT NULL',
    all: 'true',
  }

  const sortFilter = sort == 'close-date' ? 'AND close_time > NOW()' : ''
  const otherVisibilitySQL = `
  OR (visibility = 'unlisted' AND creator_id='${uid}') 
  OR (visibility = 'private' AND can_access_private_contract(id,'${uid}'))`

  return `
  WHERE (
   ${filterSQL[filter]}
  )
  ${sortFilter}
  AND (visibility = 'public' ${uid ? otherVisibilitySQL : ''})
   ${creatorId ? `and creator_id = '${creatorId}'` : ''}`
}

function getSearchContractSortSQL(
  sort: string,
  fuzzy: boolean | undefined,
  empty: boolean
) {
  type SortFields = Record<string, string>
  const sortFields: SortFields = {
    relevance: empty
      ? 'popularity_score'
      : fuzzy
      ? 'similarity_score'
      : 'ts_rank_cd(question_fts, query)',
    score: 'popularity_score',
    'daily-score': "(data->>'dailyScore')::numeric",
    '24-hour-vol': "(data->>'volume24Hours')::numeric",
    liquidity: "(data->>'elasticity')::numeric",
    'last-updated': "(data->>'lastUpdatedTime')::numeric",
    'most-popular': "(data->>'uniqueBettorCount')::integer",
    newest: 'created_time',
    'resolve-date': 'resolution_time',
    'close-date': 'close_time',
  }

  const ASCDESC = sort === 'close-date' || sort === 'liquidity' ? 'ASC' : 'DESC'
  return `ORDER BY ${sortFields[sort]} ${ASCDESC}`
}
