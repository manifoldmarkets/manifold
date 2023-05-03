import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'
import { IDatabase } from 'pg-promise'
import { IClient } from 'pg-promise/typescript/pg-subset'
import { uniqBy } from 'lodash'

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
    const { term, filter, sort, offset, limit, fuzzy, groupId, creatorId } =
      validate(bodySchema, req.body)
    const pg = createSupabaseDirectClient()
    const hasGroupAccess = groupId
      ? await pg
          .one('select * from check_group_accessibility($1,$2)', [
            groupId,
            auth?.uid ?? null,
          ])
          .then((r) => {
            return r.check_group_accessibility
          })
      : undefined
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
      hasGroupAccess,
    })
    const contracts = await pg.map(
      searchMarketSQL,
      [term],
      (r) => r.data as Contract
    )

    return (contracts ?? []) as unknown as Json
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
  hasGroupAccess?: boolean
}) {
  const {
    term,
    filter,
    sort,
    offset,
    limit,
    fuzzy,
    groupId,
    creatorId,
    uid,
    hasGroupAccess,
  } = contractInput
  let query = ''
  const emptyTerm = term.length === 0
  const whereSQL = getSearchContractWhereSQL(
    filter,
    sort,
    creatorId,
    uid,
    groupId,
    hasGroupAccess
  )
  let sortAlgorithm: string | undefined = undefined

  // Searching markets within a group
  if (groupId) {
    // Blank search within group
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
    // Fuzzy search within group
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
      // Normal full text search within group
      //TODO: For creator/group searching, use the prefix and exact matching sort, sorting
      // by the weight as it's written now and that's all you need, no websearch, etc.
      query = `
        SELECT contractz.data
        FROM (
            select contracts.*, group_contracts.group_id 
            from contracts 
            join group_contracts on group_contracts.contract_id = contracts.id
        ) as contractz,
             build_tsquery_with_prefix('english_nostop_with_prefix', $1) AS tsq(exact_query, prefix_query),
             websearch_to_tsquery('english',  $1) as query
            ${whereSQL}
        AND (
            contractz.question_nostop_fts @@ exact_query OR
            contractz.question_nostop_fts @@ prefix_query OR
            contractz.description_fts @@ query
            )
        AND contractz.group_id = '${groupId}'`
      sortAlgorithm =
        'ts_rank_cd(question_nostop_fts, exact_query, 2) * 1.0 +' +
        'ts_rank_cd(question_nostop_fts, prefix_query, 2) * 0.5 +' +
        'ts_rank_cd(description_fts, query) * 0.1'
    }
  }
  // Searching markets by creator
  else if (creatorId) {
    // Blank search for markets by creator
    if (emptyTerm) {
      query = `
      SELECT data
      FROM contracts 
      ${whereSQL}`
    }
    // Fuzzy search for markets by creator
    else if (fuzzy) {
      query = `
      SELECT contractz.data
      FROM (
        SELECT contracts.*,
               similarity(contracts.question, $1) AS similarity_score
        FROM contracts
      ) AS contractz
      ${whereSQL}
      AND contractz.similarity_score > 0.1`
    }
    // Normal full text search for markets by creator
    else {
      //TODO: For creator/group searching, use the prefix and exact matching sort, sorting
      // by the weight as it's written now and that's all you need, no websearch, etc.
      query = `
      SELECT data
      FROM contracts,
           build_tsquery_with_prefix('english_nostop_with_prefix', $1) AS tsq(exact_query, prefix_query),
           websearch_to_tsquery('english',  $1) as query 
         ${whereSQL}
      AND (
        question_nostop_fts @@ exact_query OR
        question_nostop_fts @@ prefix_query OR
        description_fts @@ query
        )`
      sortAlgorithm =
        'ts_rank_cd(question_nostop_fts, exact_query, 2) * 1.0 +' +
        'ts_rank_cd(question_nostop_fts, prefix_query, 2) * 0.5 +' +
        'ts_rank_cd(description_fts, query) * 0.1'
    }
  }
  // Blank search for markets not by group nor creator
  else {
    if (emptyTerm) {
      query = `
      SELECT data
      FROM contracts 
      ${whereSQL}`
    }
    // Fuzzy search for markets

    //TODO: for omni fuzzy search, we use the matching it has now and the exact matching
    // excluding the last word, then the prefix matching sorting everything by popularity score
    else if (fuzzy) {
      query = `
        select * from (select *
               from (SELECT contracts.*, query, query2, similarity_score, 1.0 AS weight
                     FROM contracts,
                          similarity(question, $1) AS similarity_score,
                          websearch_to_tsquery('english_nostop_with_prefix', $1) as query,
                          websearch_to_tsquery('english', $1) as query2 ${whereSQL}
        and (question_nostop_fts @@ query
        or description_fts @@ query2)
        and similarity(question, $1) > 0.3) as contractz
        union all
        select *
        from (WITH
                exact_query AS (
                    SELECT to_tsquery('english_nostop_with_prefix', get_exact_match_query($1)) AS query
                ),
                prefix_query AS (
                    SELECT to_tsquery('english_nostop_with_prefix', get_prefix_match_query($1)) AS query
                ),
                exact_matches AS (
                    SELECT contracts.*, exact_query.query, 'blank'::tsquery as query2, 0.0 AS weight
                    FROM contracts, exact_query
                    WHERE question_nostop_fts @@ exact_query.query
                ),
                prefix_matches AS (
                    SELECT contracts.*, prefix_query.query, 'blank'::tsquery as query2, 1.0 AS weight
                    FROM contracts, prefix_query
                    WHERE question_nostop_fts @@ prefix_query.query
                ),
                combined_matches AS (
                    SELECT * FROM prefix_matches
                    UNION ALL
                    SELECT * FROM exact_matches
                )
              SELECT *
              FROM (
                   SELECT *,
                          ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC) as row_num
                   FROM combined_matches
               ) AS ranked_matches
           WHERE row_num = 1
           ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC
           limit ${limit}) as contractz
     ) as all_contracts
    `
      sortAlgorithm = 'popularity_score'
    }
    // Normal full text search for markets
    else {
      query = `
          SELECT data
          FROM contracts, websearch_to_tsquery('english',  $1) as query
              ${whereSQL}
      AND (question_fts @@ query
          OR description_fts @@ query)`
    }
  }
  return (
    query +
    ' ' +
    getSearchContractSortSQL(sort, fuzzy, emptyTerm, sortAlgorithm) +
    ' ' +
    `LIMIT ${limit} OFFSET ${offset}`
  )
}

function getSearchContractWhereSQL(
  filter: string,
  sort: string,
  creatorId: string | undefined,
  uid: string | undefined,
  groupId: string | undefined,
  hasGroupAccess?: boolean
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

  const visibilitySQL = `AND (visibility = 'public' ${
    uid ? otherVisibilitySQL : ''
  })`

  return `
  WHERE (
   ${filterSQL[filter]}
  )
  ${sortFilter}
  ${
    (groupId && hasGroupAccess) || (!!creatorId && !!uid && creatorId === uid)
      ? ''
      : visibilitySQL
  }
  ${creatorId ? `and creator_id = '${creatorId}'` : ''}`
}

function getSearchContractSortSQL(
  sort: string,
  fuzzy: boolean | undefined,
  empty: boolean,
  sortingAlgorithm: string | undefined
) {
  type SortFields = Record<string, string>
  const sortFields: SortFields = {
    relevance: sortingAlgorithm
      ? sortingAlgorithm
      : empty
      ? 'popularity_score'
      : fuzzy
      ? 'similarity_score'
      : 'ts_rank_cd(question_fts, query) * 1.0 + ts_rank_cd(description_fts, query) * 0.5',
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
