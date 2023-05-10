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
    z.literal('random'),
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

  const hideStonks =
    (sort === 'relevance' || sort === 'score') && !term && !groupId

  const whereSQL = getSearchContractWhereSQL(
    filter,
    sort,
    creatorId,
    uid,
    groupId,
    hasGroupAccess,
    hideStonks
  )
  let sortAlgorithm: string | undefined = undefined
  const isUrl = term.startsWith('https://manifold.markets/')

  if (isUrl) {
    const slug = term.split('/').pop()
    query = `
    SELECT data
    FROM contracts
    ${whereSQL}
    AND slug = '${slug}' `
    sortAlgorithm = 'popularity_score'
  }
  // Searching markets within a group
  else if (groupId) {
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
      // Normal exact match and prefix search within group
      query = `
    select * from (
        WITH group_contracts as (
            select contracts.*, group_contracts.group_id 
            from contracts 
            join group_contracts on group_contracts.contract_id = contracts.id
        ) ,
        subset_query AS (
            SELECT to_tsquery('english_nostop_with_prefix', get_exact_match_minus_last_word_query($1)) AS query
        ),
        prefix_query AS (
            SELECT to_tsquery('english_nostop_with_prefix', get_prefix_match_query($1)) AS query
        ),
        subset_matches AS (
            SELECT group_contracts.*, subset_query.query, 0.0 AS weight
            FROM group_contracts, subset_query
                ${whereSQL}
                AND question_nostop_fts @@ subset_query.query
                AND group_contracts.group_id = '${groupId}'
        ),
        prefix_matches AS (
            SELECT group_contracts.*, prefix_query.query,  1.0 AS weight
            FROM group_contracts, prefix_query
                ${whereSQL}
                AND question_nostop_fts @@ prefix_query.query
                AND group_contracts.group_id = '${groupId}'
        ),
        combined_matches AS (
            SELECT * FROM prefix_matches
            UNION ALL
            SELECT * FROM subset_matches
        )
    SELECT *
    FROM (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC) as row_num
             FROM combined_matches
         ) AS ranked_matches
    WHERE row_num = 1
    -- prefix matches are weighted higher than subset matches bc they include the last word
    ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC
    ) as relevant_group_contracts
      `
      // We use popularity score bc these are exact matches and can be low quality
      sortAlgorithm = 'popularity_score'
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
    // Normal prefix and exact match search for markets by creator
    else {
      query = `
        select *
        from (WITH
          subset_query AS (
              SELECT to_tsquery('english_nostop_with_prefix', get_exact_match_minus_last_word_query($1)) AS query
          ),
          prefix_query AS (
              SELECT to_tsquery('english_nostop_with_prefix', get_prefix_match_query($1)) AS query
          ),
          subset_matches AS (
              SELECT contracts.*, subset_query.query, 0.0 AS weight
              FROM contracts, subset_query
                  ${whereSQL}
                  AND question_nostop_fts @@ subset_query.query
          ),
          prefix_matches AS (
              SELECT contracts.*, prefix_query.query,  1.0 AS weight
              FROM contracts, prefix_query
                  ${whereSQL}
                  AND question_nostop_fts @@ prefix_query.query
          ),
          combined_matches AS (
              SELECT * FROM prefix_matches
              UNION ALL
              SELECT * FROM subset_matches
          )
        SELECT *
        FROM (
             SELECT *, ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC) as row_num
             FROM combined_matches
         ) AS ranked_matches
        WHERE row_num = 1
        -- prefix matches are weighted higher than subset matches bc they include the last word
        ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC
        ) as relevant_creator_contracts
      `
      // Creators typically don't have that many markets so we don't have to sort by popularity score
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
    // Fuzzy search for markets not by group nor creator
    else if (fuzzy) {
      query = `
    select *
      from (WITH
        subset_query AS (
            SELECT to_tsquery('english_nostop_with_prefix', get_exact_match_minus_last_word_query($1)) AS query
        ),
        prefix_query AS (
            SELECT to_tsquery('english_nostop_with_prefix', get_prefix_match_query($1)) AS query
        ),
        subset_matches AS (
            SELECT contracts.*, subset_query.query, 0.0 AS weight
            FROM contracts, subset_query
                ${whereSQL}
            AND question_nostop_fts @@ subset_query.query
        ),
        prefix_matches AS (
            SELECT contracts.*, prefix_query.query,  1.0 AS weight
            FROM contracts, prefix_query
            ${whereSQL}
            AND question_nostop_fts @@ prefix_query.query
        ),
        combined_matches AS (
            SELECT * FROM prefix_matches
            UNION ALL
            SELECT * FROM subset_matches
        )
      SELECT *
      FROM (
           SELECT *,
                  ROW_NUMBER() OVER (PARTITION BY id ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC) as row_num
           FROM combined_matches
       ) AS ranked_matches
     WHERE row_num = 1
     -- prefix matches are weighted higher than subset matches bc they include the last word
     ORDER BY ts_rank_cd(question_nostop_fts, query, 4) + weight DESC
   ) as relevant_contracts
    `
      // We use popularity score bc these are exact matches and can be low quality
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
  hasGroupAccess?: boolean,
  hideStonks?: boolean
) {
  type FilterSQL = Record<string, string>
  const filterSQL: FilterSQL = {
    open: 'resolution_time IS NULL AND close_time > NOW()',
    closed: 'close_time < NOW() AND resolution_time IS NULL',
    resolved: 'resolution_time IS NOT NULL',
    all: 'true',
  }

  const stonkFilter = hideStonks ? `AND outcome_type != 'STONK'` : ''

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
   ${stonkFilter}
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
    random: 'random()',
  }

  const ASCDESC = sort === 'close-date' || sort === 'liquidity' ? 'ASC' : 'DESC'
  return `ORDER BY ${sortFields[sort]} ${ASCDESC}`
}
