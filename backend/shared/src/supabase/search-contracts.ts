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
  limit as lim,
  withClause,
  groupBy,
} from 'shared/supabase/sql-builder'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { PROD_MANIFOLD_LOVE_GROUP_SLUG } from 'common/envs/constants'
import { constructPrefixTsQuery } from 'shared/helpers/search'
import { convertContract } from 'common/supabase/contracts'
import { buildArray } from 'common/util/array'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { log } from 'shared/utils'

// TODO: if the scheduler isn't deployed once/week, a user's topics used for these markets
//  will be cached and out of date
export async function getForYouMarkets(userId: string, limit = 25) {
  const searchMarketSQL = await getForYouSQL(userId, 'all', 'ALL', limit, 0)

  const pg = createSupabaseDirectClient()
  const contracts = await pg.map(searchMarketSQL, [], (r) => convertContract(r))

  return contracts ?? []
}

export async function getForYouSQL(
  userId: string,
  filter: string,
  contractType: string,
  limit: number,
  offset: number
) {
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache(userId)
  }
  // Still no topic interests, return default search
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    log('No topic interests found for user', userId)
    return renderSql(
      select(
        `data, importance_score, conversion_score, freshness_score, view_count`
      ),
      from('contracts'),
      orderBy(`importance_score desc`),
      getSearchContractWhereSQL({
        filter,
        contractType,
        uid: userId,
        hideStonks: true,
      }),
      lim(limit, offset)
    )
  }

  const forYou = renderSql(
    buildArray(
      select(
        'contracts.*, avg(uti.avg_conversion_score) as topic_conversion_score'
      ),
      from(
        `(select
               unnest(array[$1]) as group_id,
               unnest(array[$2]) as avg_conversion_score) as uti`,
        [
          Object.keys(userIdsToAverageTopicConversionScores[userId]),
          Object.values(userIdsToAverageTopicConversionScores[userId]),
        ]
      ),
      join(`group_contracts on group_contracts.group_id = uti.group_id`),
      join(`contracts on contracts.id = group_contracts.contract_id`),
      where(
        `contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)`,
        [userId]
      ),
      withClause(
        `user_follows as (select follow_id from user_follows where user_id = $1)`,
        [userId]
      ),
      getSearchContractWhereSQL({
        filter,
        contractType,
        uid: userId,
        hideStonks: true,
      }),
      lim(limit, offset),
      groupBy('contracts.id'),
      orderBy(`sum(power(uti.avg_conversion_score, 0.5)  * contracts.importance_score *
         (1 + case
          when contracts.creator_id = any(select follow_id from user_follows) then 0.2
          else 0.0 end))
           desc`)
    )
  )
  return forYou
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
  isPolitics?: boolean
}) {
  const {
    term,
    sort,
    offset,
    limit,
    groupId,
    creatorId,
    searchType,
    isPolitics,
  } = args

  const hideStonks = sort === 'score' && !term.length && !groupId
  const hideLove = sort === 'newest' && !term.length && !groupId && !creatorId

  const whereSql = getSearchContractWhereSQL({ ...args, hideStonks, hideLove })
  const isUrl = term.startsWith('https://manifold.markets/')
  if (isUrl) {
    const slug = term.split('/').pop()
    return renderSql(
      select('data, importance_score, view_count'),
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
    select('data, importance_score, view_count'),
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
    isPolitics && where('is_politics = true'),
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
      : contractType === 'PSEUDO_NUMERIC'
      ? `outcome_type = 'PSEUDO_NUMERIC' OR outcome_type = 'NUMBER'`
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
    sql: `importance_score::numeric desc, (data->>'uniqueBettorCount')::integer`,
    sortCallback: (c: Contract) =>
      c.importanceScore > 0 ? c.importanceScore : c.uniqueBettorCount,
    order: 'DESC',
  },
  'daily-score': {
    sql: "(data->>'dailyScore')::numeric",
    sortCallback: (c: Contract) => c.dailyScore,
    order: 'DESC',
  },
  'freshness-score': {
    sql: 'freshness_score',
    sortCallback: (c: Contract) => c.freshnessScore,
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
    sql: "COALESCE((data->>'bountyLeft')::numeric, -1)",
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
