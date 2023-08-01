import { z } from 'zod'
import { Contract } from 'common/contract'
import { createSupabaseDirectClient, pgp } from 'shared/supabase/init'
import {
  SqlBuilder,
  buildSql,
  from,
  join,
  renderSql,
  select,
  where,
  withClause,
} from 'shared/supabase/sql-builder'
import { Json, MaybeAuthedEndpoint, validate } from './helpers'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'

export const FIRESTORE_DOC_REF_ID_REGEX = /^[a-zA-Z0-9_-]{1,}$/
const TOPIC_DISTANCE_THRESHOLD = 0.23
const bodySchema = z.object({
  term: z.string(),
  filter: z.union([
    z.literal('open'),
    z.literal('closing-this-month'),
    z.literal('closing-next-month'),
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
    z.literal('bounty-amount'),
  ]),
  contractType: z.union([
    z.literal('ALL'),
    z.literal('BINARY'),
    z.literal('MULTIPLE_CHOICE'),
    z.literal('FREE_RESPONSE'),
    z.literal('PSEUDO_NUMERIC'),
    z.literal('BOUNTIED_QUESTION'),
    z.literal('STONK'),
    z.literal('POLL'),
  ]),
  topic: z.string().optional(),
  offset: z.number().gte(0),
  limit: z.number().gt(0),
  fuzzy: z.boolean().optional(),
  groupId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
  creatorId: z.string().regex(FIRESTORE_DOC_REF_ID_REGEX).optional(),
})

export const supabasesearchcontracts = MaybeAuthedEndpoint(
  async (req, auth) => {
    const {
      term,
      topic,
      filter,
      sort,
      contractType,
      offset,
      limit,
      fuzzy,
      groupId,
      creatorId,
    } = validate(bodySchema, req.body)
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
      contractType,
      offset,
      limit,
      fuzzy,
      groupId,
      creatorId,
      uid: auth?.uid,
      hasGroupAccess,
      topic,
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
  contractType: string
  offset: number
  limit: number
  fuzzy?: boolean
  groupId?: string
  creatorId?: string
  uid?: string
  hasGroupAccess?: boolean
  topic?: string
}) {
  const {
    term,
    filter,
    sort,
    contractType,
    offset,
    limit,
    fuzzy,
    groupId,
    creatorId,
    uid,
    hasGroupAccess,
    topic,
  } = contractInput

  let query = ''
  let queryBuilder: SqlBuilder | undefined
  const emptyTerm = term.length === 0

  const hideStonks =
    (sort === 'relevance' || sort === 'score') && emptyTerm && !groupId

  const whereSqlBuilder = getSearchContractWhereSQL(
    filter,
    sort,
    contractType,
    creatorId,
    uid,
    groupId,
    hasGroupAccess,
    hideStonks
  )
  const whereSQL = renderSql(whereSqlBuilder)
  let sortAlgorithm: string | undefined = undefined
  const isUrl = term.startsWith('https://manifold.markets/')

  if (isUrl) {
    const slug = term.split('/').pop()
    queryBuilder = buildSql(
      select('data'),
      from('contracts'),
      whereSqlBuilder,
      where('slug = $1', [slug])
    )
    sortAlgorithm = 'importance_score'
  }
  // Searching markets within a group
  else if (groupId) {
    // Blank search within group
    if (emptyTerm) {
      queryBuilder = buildSql(
        select('contractz.data'),
        from(`(
          select contracts.*, 
          group_contracts.group_id 
          from contracts 
          join group_contracts 
          on group_contracts.contract_id = contracts.id) 
        as contractz`),
        whereSqlBuilder,
        where('contractz.group_id = $1', [groupId])
      )
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
      // We use importance score bc these are exact matches and can be low quality
      sortAlgorithm = 'importance_score'
    }
  }
  // Searching markets by creator
  else if (creatorId) {
    // Blank search for markets by creator
    if (emptyTerm) {
      queryBuilder = buildSql(
        select('data'),
        from('contracts'),
        whereSqlBuilder
      )
    }
    // Fuzzy search for markets by creator
    else if (fuzzy) {
      queryBuilder = buildSql(
        select('contractz.data'),
        from(`(
          select contracts.*,
          similarity(contracts.question, $1) AS similarity_score
          from contracts
          ) as contractz`),
        whereSqlBuilder,
        where('contractz.similarity_score > 0.1')
      )
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
    const topicJoin = topic
      ? `contract_embeddings ON contracts.id = contract_embeddings.contract_id, topic_embedding`
      : ''
    const topicQuery = pgp.as.format(
      'topic_embedding AS ( SELECT embedding FROM topic_embeddings WHERE topic = $1 LIMIT 1)',
      [topic]
    )
    const topicFilter = topic
      ? `(contract_embeddings.embedding <=> topic_embedding.embedding < ${TOPIC_DISTANCE_THRESHOLD})`
      : ''
    const topicSqlBuilder = buildSql(
      withClause(topicQuery),
      join(topicJoin),
      where(topicFilter)
    )

    if (emptyTerm) {
      queryBuilder = buildSql(
        select('data'),
        from('contracts'),
        whereSqlBuilder,
        topicSqlBuilder
      )
    }
    // Fuzzy search for markets not by group nor creator
    else if (fuzzy) {
      const fuzzyTopicQuery = topic ? `${topicQuery},` : ''
      const topicSelect = topic ? `contract_embeddings.embedding,` : ''
      const topicFrom = topic ? `, contract_embeddings, topic_embedding` : ''
      const topicAnd = topic
        ? `AND contracts.id = contract_embeddings.contract_id`
        : ''
      const whereSqlWithTopic = topic
        ? whereSQL + ` AND ${topicFilter}`
        : whereSQL
      query = `
select * from (
    WITH ${fuzzyTopicQuery}
     subset_query AS (
         SELECT to_tsquery('english_nostop_with_prefix', get_exact_match_minus_last_word_query($1)) AS query
     ),
     prefix_query AS (
         SELECT to_tsquery('english_nostop_with_prefix', get_prefix_match_query($1)) AS query
     ),
     subset_matches AS (
         SELECT contracts.*, ${topicSelect} subset_query.query, 0.0 AS weight
         FROM contracts, subset_query ${topicFrom}
             ${whereSqlWithTopic}
           AND question_nostop_fts @@ subset_query.query ${topicAnd}
        ),
     prefix_matches AS (
         SELECT contracts.*, ${topicSelect} prefix_query.query,  1.0 AS weight
         FROM contracts, prefix_query ${topicFrom}
           ${whereSqlWithTopic}
           AND question_nostop_fts @@ prefix_query.query ${topicAnd}
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
  ) as ranked_matches
    `
      // We use importance score bc these are exact matches and can be low quality
      sortAlgorithm = 'importance_score'
    }
    // Normal full text search for markets
    else {
      query = `
          with ${topicQuery}
          SELECT data
          FROM contracts
          ${topicJoin ? `JOIN ${topicJoin}` : ''},
               websearch_to_tsquery('english',  $1) as query
          ${whereSQL}
          ${topicFilter ? `AND ${topicFilter}` : ''}
          AND (question_fts @@ query
          OR description_fts @@ query)`
    }
  }
  if (queryBuilder) {
    query = renderSql(queryBuilder)
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
  contractType: string,
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
    // Include an extra day to capture markets that close on the first of the month. Add 7 hours to shift UTC time zone to PT.
    'closing-this-month': `close_time > now() AND close_time < (date_trunc('month', now()) + interval '1 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    'closing-next-month': `close_time > ((date_trunc('month', now()) + interval '1 month') + interval '1 day' + interval '7 hours') AND close_time < (date_trunc('month', now()) + interval '2 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    resolved: 'resolution_time IS NOT NULL',
    all: 'true',
  }
  const contractTypeFilter =
    contractType != 'ALL' ? `outcome_type = '${contractType}'` : ''

  const stonkFilter =
    hideStonks && contractType !== 'STONK' ? `outcome_type != 'STONK'` : ''
  const sortFilter = sort == 'close-date' ? 'close_time > NOW()' : ''
  const creatorFilter = creatorId ? `creator_id = '${creatorId}'` : ''
  const visibilitySQL = getContractPrivacyWhereSQLFilter(
    uid,
    groupId,
    creatorId,
    hasGroupAccess
  )
  return buildSql(
    where(filterSQL[filter]),
    where(stonkFilter),
    where(sortFilter),
    where(contractTypeFilter),
    where(visibilitySQL),
    where(creatorFilter)
  )
}

type SortFields = Record<string, string>

function getSearchContractSortSQL(
  sort: string,
  fuzzy: boolean | undefined,
  empty: boolean,
  sortingAlgorithm: string | undefined
) {
  const sortFields: SortFields = {
    relevance: sortingAlgorithm
      ? sortingAlgorithm
      : empty
      ? 'importance_score'
      : fuzzy
      ? 'similarity_score'
      : 'ts_rank_cd(question_fts, query) * 1.0 + ts_rank_cd(description_fts, query) * 0.5',
    score: 'importance_score',
    'daily-score': "(data->>'dailyScore')::numeric",
    '24-hour-vol': "(data->>'volume24Hours')::numeric",
    liquidity: "(data->>'elasticity')::numeric",
    'last-updated': "(data->>'lastUpdatedTime')::numeric",
    'most-popular': "(data->>'uniqueBettorCount')::integer",
    newest: 'created_time',
    'resolve-date': 'resolution_time',
    'close-date': 'close_time',
    random: 'random()',
    'bounty-amount': "COALESCE((data->>'bountyLeft')::integer, -1)",
  }

  const ASCDESC = sort === 'close-date' || sort === 'liquidity' ? 'ASC' : 'DESC'
  return `ORDER BY ${sortFields[sort]} ${ASCDESC}`
}
