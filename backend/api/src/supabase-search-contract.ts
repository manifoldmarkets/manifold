import { z } from 'zod'
import { filter, Sort } from '../../../web/components/contract-search'
import { authEndpoint, validate } from './helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'

const bodySchema = z.object({
  term: z.string(),
  filter: z.string(),
  sort: z.string(),
  offset: z.number().gte(0),
  limit: z.number().gt(0),
  fuzzy: z.boolean(),
  groupId: z.string().optional(),
  creatorId: z.string().optional(),
})

export const supabasesearchcontracts = authEndpoint(async (req, auth) => {
  const { term, filter, sort, offset, limit, fuzzy, groupId, creatorId } =
    validate(bodySchema, req.body)
  const pg = createSupabaseDirectClient()
  const searchMarketSQL = getSearchContractSQL({
    term: term,
    filter: filter,
    sort: sort,
    offset: offset,
    limit: limit,
    fuzzy: fuzzy,
    groupId: groupId,
    creatorId: creatorId,
    uid: auth.uid,
  })
  console.log(searchMarketSQL)

  const contracts = await pg.map(searchMarketSQL, [], (r) => r.data as Contract)

  return contracts ?? []
})

function getSearchContractSQL(contractInput: {
  term: string
  filter: filter
  sort: Sort
  offset: number
  limit: number
  fuzzy?: boolean
  groupId?: string
  creatorId?: string
  uid?: string
}) {
  const { term, filter, sort, offset, limit, fuzzy, groupId, creatorId, uid } =
    contractInput
  console.log(term, limit, offset)
  let query = ''
  const emptyTerm = term.length === 0
  const whereSQL = getSearchContractWhereSQL(filter, sort, creatorId, uid)
  if (groupId) {
    if (emptyTerm) {
      query = `
        SELECT contractz.data
        FROM (
          select contracts_rbac.*, 
          group_contracts.group_id 
          from contracts_rbac 
          join group_contracts 
          on group_contracts.contract_id = contracts_rbac.id) 
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
                similarity(contracts.question, '${term}') AS similarity_score,
                group_contracts.group_id
            FROM contracts_rbac 
            join group_contracts 
            on group_contracts.contract_id = contracts_rbac.id
        ) AS contractz
      ${whereSQL}
      AND contractz.similarity_score > 0.1
      AND contractz.group_id = '${groupId}'`
    } else {
      // if full text search within group
      query = `
        SELECT contractz.data
        FROM (
            select contracts_rbac.*, group_contracts.group_id 
            from contracts_rbac 
            join group_contracts on group_contracts.contract_id = contracts_rbac.id
        ) as contractz,
        websearch_to_tsquery(' english ', '${term}') query
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
        SELECT contracts_rbac.*,
               similarity(contracts_rbac.question, '${term}') AS similarity_score
        FROM contracts_rbac
      ) AS contractz
      ${whereSQL}
      AND contractz.similarity_score > 0.1`
    } else {
      query = `
      SELECT contracts_rbac.data
      FROM contracts_rbac, websearch_to_tsquery('english',  '${term}') query
         ${whereSQL}
      AND contracts_rbac.question_fts @@ query`
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
  filter: filter,
  sort: Sort,
  creatorId: string | undefined,
  uid: string | undefined
) {
  type FilterSQL = Record<filter, string>
  const filterSQL: FilterSQL = {
    open: 'resolution_time IS NULL',
    closed: 'close_time < NOW() AND resolution_time IS NULL',
    resolved: 'resolution_time IS NOT NULL',
    all: 'true',
  }

  const sortFilter = sort == 'close-date' ? 'AND close_time > NOW()' : ''
  const privateGroupSQL = `OR (visibility = 'private' AND can_access_private_contract(id,'${uid}'))`

  return `
  WHERE (
   ${filterSQL[filter]}
  )
  ${sortFilter}
  AND (visibility <> 'private' ${uid ? privateGroupSQL : ''}
  ${creatorId ? `and creator_id = '${creatorId}'` : ''}
  )`
}

function getSearchContractSortSQL(
  sort: Sort,
  fuzzy: boolean | undefined,
  empty: boolean
) {
  type SortFields = Record<Sort, string>
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

  const ASCDESC = sort === 'close-date' ? 'ASC' : 'DESC'
  return `ORDER BY ${sortFields[sort]} ${ASCDESC} NULLS LAST`
}
