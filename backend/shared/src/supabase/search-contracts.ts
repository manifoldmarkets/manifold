import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  SqlBuilder,
  buildSql,
  from,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'

export async function getForYouMarkets(userId: string, limit = 25) {
  const searchMarketSQL = getForYouSQL(userId, 'all', 'ALL', limit, 0)

  const pg = createSupabaseDirectClient()
  const contracts = await pg.map(searchMarketSQL, [], (r) => r.data as Contract)

  return contracts ?? []
}

export function getForYouSQL(
  uid: string,
  filter: string,
  contractType: string,
  limit: number,
  offset: number
) {
  const whereClause = renderSql(
    getSearchContractWhereSQL(
      filter,
      '',
      contractType,
      undefined,
      uid,
      undefined,
      false,
      true
    )
  )

  return `with 
  user_interest AS (SELECT interest_embedding 
                       FROM user_embeddings
                       WHERE user_id = '${uid}'
                       LIMIT 1),
user_disinterests AS (
  SELECT contract_id
  FROM user_disinterests
  WHERE user_id = '${uid}'
),

user_follows AS (SELECT follow_id
                      FROM user_follows
                      WHERE user_id = '${uid}'),

groups AS (
  SELECT group_id
  FROM group_members
  WHERE member_id = '${uid}'
)

select data, contract_id,
      importance_score
           * (
              0.3
               + 3 * ((1 - (contract_embeddings.embedding <=> user_interest.interest_embedding)) - 0.8)
               + (CASE WHEN user_follows.follow_id IS NOT NULL THEN 0.1 ELSE 0 END)
                + (CASE WHEN  EXISTS (
                    SELECT 1
                    FROM group_contracts
                    join groups on group_contracts.group_id = groups.group_id
                    WHERE group_contracts.contract_id = contracts.id
                  ) THEN 0.3 ELSE 0 END)
           )
           AS modified_importance_score
from user_interest,
     contracts
         join contract_embeddings ON contracts.id = contract_embeddings.contract_id
        LEFT JOIN user_follows ON contracts.creator_id = user_follows.follow_id
    ${whereClause}
  and importance_score > ${offset === 0 ? 0.5 : 0.25}
  AND NOT EXISTS (
    SELECT 1
    FROM user_disinterests
    WHERE user_disinterests.contract_id = contracts.id
  )
ORDER BY modified_importance_score DESC
LIMIT ${limit} OFFSET ${offset};`
}

export const hasGroupAccess = async (groupId?: string, uid?: string) => {
  const pg = createSupabaseDirectClient()
  if (!groupId) return undefined
  return await pg
    .one('select * from check_group_accessibility($1,$2)', [
      groupId,
      uid ?? null,
    ])
    .then((r: any) => {
      return r.check_group_accessibility
    })
}

export function getSearchContractSQL(contractInput: {
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
  isForYou?: boolean
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
  } = contractInput

  let query = ''
  let queryBuilder: SqlBuilder | undefined
  const emptyTerm = term.length === 0

  const hideStonks = sort === 'score' && emptyTerm && !groupId

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
  const isUrl = term.startsWith('https://manifold.markets/')

  if (isUrl) {
    const slug = term.split('/').pop()
    queryBuilder = buildSql(
      select('data'),
      from('contracts'),
      whereSqlBuilder,
      where('slug = $1', [slug])
    )
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
    if (emptyTerm) {
      queryBuilder = buildSql(
        select('data'),
        from('contracts'),
        whereSqlBuilder
      )
    }
    // Fuzzy search for markets not by group nor creator
    else if (fuzzy) {
      query = `
select * from (
    WITH
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
         SELECT contracts.*,  prefix_query.query,  1.0 AS weight
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
  ) as ranked_matches
    `
    }
    // Normal full text search for markets
    else {
      query = `
          SELECT data
          FROM contracts,
               websearch_to_tsquery('english',  $1) as query
          ${whereSQL}
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
    getSearchContractSortSQL(sort) +
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
    open: 'resolution_time IS NULL AND (close_time > NOW() or close_time is null)',
    closed: 'close_time < NOW() AND resolution_time IS NULL',
    // Include an extra day to capture markets that close on the first of the month. Add 7 hours to shift UTC time zone to PT.
    'closing-this-month': `close_time > now() AND close_time < (date_trunc('month', now()) + interval '1 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    'closing-next-month': `close_time > ((date_trunc('month', now()) + interval '1 month') + interval '1 day' + interval '7 hours') AND close_time < (date_trunc('month', now()) + interval '2 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    resolved: 'resolution_time IS NOT NULL',
    all: 'true',
  }
  const contractTypeFilter =
    contractType === 'ALL'
      ? ''
      : contractType === 'MULTIPLE_CHOICE'
      ? `outcome_type = 'FREE_RESPONSE' OR outcome_type = 'MULTIPLE_CHOICE'`
      : `outcome_type = '${contractType}'`

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

  const deletedFilter = `data->>'deleted' is null OR (data->>'deleted')::boolean = false`

  return buildSql(
    where(filterSQL[filter]),
    where(stonkFilter),
    where(sortFilter),
    where(contractTypeFilter),
    where(visibilitySQL),
    where(creatorFilter),
    where(deletedFilter)
  )
}

type SortFields = Record<string, string>

function getSearchContractSortSQL(sort: string) {
  const sortFields: SortFields = {
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
    'prob-descending': "resolution DESC, (data->>'p')::numeric",
    'prob-ascending': "resolution DESC, (data->>'p')::numeric",
  }

  const ASCDESC =
    sort === 'close-date' || sort === 'liquidity' || sort === 'prob-ascending'
      ? 'ASC'
      : sort === 'prob-descending'
      ? 'DESC NULLS LAST'
      : 'DESC'
  return `ORDER BY ${sortFields[sort]} ${ASCDESC}`
}
