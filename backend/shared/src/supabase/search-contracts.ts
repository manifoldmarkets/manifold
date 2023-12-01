import { Contract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  join,
  limit as sqlLimit,
  renderSql,
  select,
  where,
  orderBy,
} from 'shared/supabase/sql-builder'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { PROD_MANIFOLD_LOVE_GROUP_SLUG } from 'common/envs/constants'
import { constructPrefixTsQuery } from 'shared/helpers/search'

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
    getSearchContractWhereSQL({ filter, contractType, uid, hideStonks: true })
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
              0.4
                + (CASE WHEN  EXISTS (
                    SELECT 1
                    FROM group_contracts
                    join groups on group_contracts.group_id = groups.group_id
                    WHERE group_contracts.contract_id = contracts.id
                  ) THEN 
                        0.59 
                        + (CASE WHEN user_follows.follow_id IS NOT NULL THEN 0.01 ELSE 0 END) 
                      ELSE 
                        (CASE WHEN user_follows.follow_id IS NOT NULL THEN 0.1 ELSE 0 END)  
                        + 5 * ((1 - (contract_embeddings.embedding <=> user_interest.interest_embedding)) - 0.8)
                      END)
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
export type SearchTypes =
  | 'without-stopwords'
  | 'with-stopwords'
  | 'description'
  | 'prefix'
  | 'answer'

export function getSearchContractSQL(args: {
  term: string
  filter: string
  sort: string
  contractType: string
  offset: number
  limit: number
  groupId?: string
  creatorId?: string
  uid?: string
  groupAccess?: boolean
  isForYou?: boolean
  searchType: SearchTypes
}) {
  const { term, sort, offset, limit, groupId, creatorId, searchType } = args

  const hideStonks = sort === 'score' && !term.length && !groupId
  const hideLove = sort === 'newest' && !term.length && !groupId && !creatorId

  const whereSql = getSearchContractWhereSQL({ ...args, hideStonks, hideLove })
  const isUrl = term.startsWith('https://manifold.markets/')
  if (isUrl) {
    const slug = term.split('/').pop()
    return renderSql(
      select('data'),
      from('contracts'),
      whereSql,
      where('slug = $1', [slug])
    )
  }

  const answersSubQuery = renderSql(
    select('distinct a.contract_id'),
    from('answers a'),
    where(`a.text_fts @@ websearch_to_tsquery('english', $1)`, [term])
  )

  // Normal full text search
  return renderSql(
    select('data, importance_score'),
    from('contracts'),
    groupId && [
      join('group_contracts gc on gc.contract_id = contracts.id'),
      where('gc.group_id = $1', [groupId]),
    ],
    searchType === 'answer' &&
      join(
        `(${answersSubQuery}) as matched_answers on matched_answers.contract_id = contracts.id`
      ),

    whereSql,

    term.length && [
      searchType === 'prefix' &&
        where(
          `question_fts @@ to_tsquery('english', $1)`,
          constructPrefixTsQuery(term)
        ),
      searchType === 'without-stopwords' &&
        where(`question_fts @@ websearch_to_tsquery('english', $1)`, term),
      searchType === 'with-stopwords' &&
        where(
          `question_nostop_fts @@ websearch_to_tsquery('english_nostop_with_prefix', $1)`,
          term
        ),
      searchType === 'description' &&
        where(`description_fts @@ websearch_to_tsquery('english', $1)`, term),
    ],

    orderBy(getSearchContractSortSQL(sort)),
    sqlLimit(limit, offset)
  )
}

function getSearchContractWhereSQL(args: {
  filter: string
  sort?: string
  contractType: string
  creatorId?: string
  uid?: string
  groupId?: string
  hasGroupAccess?: boolean
  hideStonks?: boolean
  hideLove?: boolean
}) {
  const {
    filter,
    sort,
    contractType,
    creatorId,
    uid,
    groupId,
    hasGroupAccess,
    hideStonks,
    hideLove,
  } = args

  type FilterSQL = Record<string, string>
  const filterSQL: FilterSQL = {
    open: 'resolution_time IS NULL AND (close_time > NOW() or close_time is null)',
    closed: 'close_time < NOW() AND resolution_time IS NULL',
    // Include an extra day to capture markets that close on the first of the month. Add 7 hours to shift UTC time zone to PT.
    'closing-this-month': `close_time > now() AND close_time < (date_trunc('month', now()) + interval '1 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    'closing-next-month': `close_time > ((date_trunc('month', now()) + interval '1 month') + interval '1 day' + interval '7 hours') AND close_time < (date_trunc('month', now()) + interval '2 month' + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    resolved: 'resolution_time IS NOT NULL',
    all: '',
  }
  const contractTypeFilter =
    contractType === 'ALL'
      ? ''
      : contractType === 'MULTIPLE_CHOICE'
      ? `outcome_type = 'FREE_RESPONSE' OR outcome_type = 'MULTIPLE_CHOICE'`
      : `outcome_type = '${contractType}'`

  const stonkFilter =
    hideStonks && contractType !== 'STONK' ? `outcome_type != 'STONK'` : ''
  const loveFilter = hideLove
    ? `group_slugs is null or not group_slugs && $1`
    : ''
  const sortFilter = sort == 'close-date' ? 'close_time > NOW()' : ''
  const creatorFilter = creatorId ? `creator_id = '${creatorId}'` : ''
  const visibilitySQL = getContractPrivacyWhereSQLFilter(
    uid,
    creatorId,
    groupId,
    hasGroupAccess
  )

  const deletedFilter = `deleted = false`

  return [
    where(filterSQL[filter]),
    where(stonkFilter),
    where(loveFilter, [[PROD_MANIFOLD_LOVE_GROUP_SLUG]]),
    where(sortFilter),
    where(contractTypeFilter),
    where(visibilitySQL),
    where(creatorFilter),
    where(deletedFilter),
  ]
}

type SortFields = Record<
  string,
  {
    sql: string
    sortCallback: (c: Contract) => number
    order: 'ASC' | 'DESC' | 'DESC NULLS LAST'
  }
>
export const sortFields: SortFields = {
  score: {
    sql: 'importance_score',
    sortCallback: (c: Contract) => c.importanceScore,
    order: 'DESC',
  },
  'daily-score': {
    sql: "(data->>'dailyScore')::numeric",
    sortCallback: (c: Contract) => c.dailyScore,
    order: 'DESC',
  },
  '24-hour-vol': {
    sql: "(data->>'volume24Hours')::numeric",
    sortCallback: (c: Contract) => c.volume24Hours,
    order: 'DESC',
  },
  liquidity: {
    sql: "(data->>'elasticity')::numeric",
    sortCallback: (c: Contract) => c.elasticity,
    order: 'ASC',
  },
  'last-updated': {
    sql: "(data->>'lastUpdatedTime')::numeric",
    sortCallback: (c: Contract) => c.lastUpdatedTime,
    order: 'DESC',
  },
  'most-popular': {
    sql: "(data->>'uniqueBettorCount')::integer",
    sortCallback: (c: Contract) => c.uniqueBettorCount,
    order: 'DESC',
  },
  newest: {
    sql: 'created_time',
    sortCallback: (c: Contract) => c.createdTime,
    order: 'DESC',
  },
  'resolve-date': {
    sql: 'resolution_time',
    sortCallback: (c: Contract) => c.resolutionTime ?? 0,
    order: 'DESC NULLS LAST',
  },
  'close-date': {
    sql: 'close_time',
    sortCallback: (c: Contract) => c.closeTime ?? Infinity,
    order: 'ASC',
  },
  random: {
    sql: 'random()',
    sortCallback: () => Math.random(),
    order: 'DESC',
  },
  'bounty-amount': {
    sql: "COALESCE((data->>'bountyLeft')::integer, -1)",
    sortCallback: (c: Contract) => ('bountyLeft' in c && c.bountyLeft) || -1,
    order: 'DESC',
  },
  'prob-descending': {
    sql: "resolution DESC, (data->>'p')::numeric",
    sortCallback: (c: Contract) => ('p' in c && c.p) || 0,
    order: 'DESC NULLS LAST',
  },
  'prob-ascending': {
    sql: "resolution DESC, (data->>'p')::numeric",
    sortCallback: (c: Contract) => ('p' in c && c.p) || 0,
    order: 'ASC',
  },
}
function getSearchContractSortSQL(sort: string) {
  return `${sortFields[sort].sql} ${sortFields[sort].order}`
}
