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
export type SearchTypes =
  | 'without-stopwords'
  | 'with-stopwords'
  | 'description'
  | 'prefix'

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
  const { term, sort, offset, limit, groupId, searchType } = args

  const hideStonks = sort === 'score' && !term.length && !groupId

  const whereSql = getSearchContractWhereSQL({ ...args, hideStonks })

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

  // Normal full text search
  return renderSql(
    select('data'),
    from('contracts'),
    groupId && [
      join('group_contracts gc on gc.contract_id = contracts.id'),
      where('gc.group_id = $1', [groupId]),
    ],

    whereSql,

    term.length && [
      searchType === 'prefix' &&
        where(`question_fts @@ to_tsquery('english', $1)`),
      searchType === 'without-stopwords' &&
        where(`question_fts @@ websearch_to_tsquery('english', $1)`),
      searchType === 'with-stopwords' &&
        where(
          `question_nostop_fts @@ websearch_to_tsquery('english_nostop_with_prefix', $1)`
        ),
      searchType === 'description' &&
        where(`description_fts @@ websearch_to_tsquery('english', $1)`),
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
  const sortFilter = sort == 'close-date' ? 'close_time > NOW()' : ''
  const creatorFilter = creatorId ? `creator_id = '${creatorId}'` : ''
  const visibilitySQL = getContractPrivacyWhereSQLFilter(
    uid,
    groupId,
    creatorId,
    hasGroupAccess
  )

  const deletedFilter = `data->>'deleted' is null OR (data->>'deleted')::boolean = false`

  return [
    where(filterSQL[filter]),
    where(stonkFilter),
    where(sortFilter),
    where(contractTypeFilter),
    where(visibilitySQL),
    where(creatorFilter),
    where(deletedFilter),
  ]
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
      : sort === 'score'
      ? 'DESC'
      : 'DESC NULLS LAST'
  return `${sortFields[sort]} ${ASCDESC}`
}
