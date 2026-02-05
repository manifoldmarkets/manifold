import { Contract, isSportsContract } from 'common/contract'
import { PROD_MANIFOLD_LOVE_GROUP_SLUG } from 'common/envs/constants'
import { GROUP_SCORE_PRIOR } from 'common/feed'
import { tsToMillis } from 'common/supabase/utils'
import { answerCostTiers, getTierIndexFromLiquidity } from 'common/tier'
import { PrivateUser } from 'common/user'
import { buildArray, filterDefined } from 'common/util/array'
import { constructPrefixTsQuery } from 'shared/helpers/search'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  groupBy,
  join,
  leftJoin,
  limit as lim,
  orderBy,
  renderSql,
  select,
  limit as sqlLimit,
  where,
  withClause,
} from 'shared/supabase/sql-builder'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'
import { contractColumnsToSelectWithPrefix, log } from 'shared/utils'

const DEFAULT_THRESHOLD = 1000
type TokenInputType = 'CASH' | 'MANA' | 'ALL' | 'CASH_AND_MANA'
let importanceScoreThreshold: number | undefined = undefined
let freshnessScoreThreshold: number | undefined = undefined

type SharedSearchArgs = {
  filter: string
  contractType: string
  limit: number
  offset: number
  sort: string
  token: TokenInputType
  creatorId?: string
  uid?: string
  hasBets?: string
  liquidity?: number
  isPrizeMarket?: boolean
}

export async function getForYouSQL(
  args: SharedSearchArgs & {
    uid: string
    privateUser?: PrivateUser
    threshold?: number
  }
) {
  const {
    limit,
    offset,
    sort,
    privateUser,
    threshold = DEFAULT_THRESHOLD,
    hasBets,
  } = args

  const userId = args.uid
  // const userId = 'hqdXgp0jK2YMMhPs067eFK4afEH3' // Eliza
  // if (process.platform === 'darwin') {
  //   userId = await loadRandomUser()
  //   log('Searching for random user id:', userId)
  // }

  const sortByScore = sort === 'score' ? 'importance_score' : 'freshness_score'
  if (
    importanceScoreThreshold === undefined ||
    freshnessScoreThreshold === undefined
  ) {
    await loadScoreThresholds(threshold)
  }

  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache([userId])
  }
  // Still no topic interests, return default search
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    return basicSearchSQL({
      ...args,
      uid: userId,
      privateUser,
    })
  }
  const userBetsJoin = hasBets === '1' && userId && userBetsJoinSql
  const GROUP_SCORE_POWER = 4
  const forYou = renderSql(
    buildArray(
      select(
        'contracts.*, coalesce(avg(uti.avg_conversion_score),1) as avg_topic_conversion_score'
      ),
      from('contracts'),
      join(`group_contracts on contracts.id = group_contracts.contract_id`),
      leftJoin(
        `(select
          unnest(array[$1]) as group_id,
          unnest(array[$2]) as avg_conversion_score)
          as uti on uti.group_id = group_contracts.group_id`,
        [
          Object.keys(userIdsToAverageTopicConversionScores[userId]),
          Object.values(userIdsToAverageTopicConversionScores[userId]),
        ]
      ),
      where(
        `contracts.id not in (select contract_id from user_disinterests where user_id = $1 and contract_id = contracts.id)`,
        [userId]
      ),
      privateUserBlocksSql(privateUser),
      withClause(
        `user_follows as (select follow_id from user_follows where user_id = $1)`,
        [userId]
      ),
      userBetsJoin,
      getSearchContractWhereSQL({
        ...args,
        hideStonks: true,
      }),
      offset <= threshold / 2 &&
        sort === 'score' &&
        importanceScoreThreshold &&
        where(`contracts.importance_score > $1`, [importanceScoreThreshold]),
      offset <= threshold / 2 &&
        sort === 'freshness-score' &&
        freshnessScoreThreshold &&
        where(`contracts.freshness_score > $1`, [freshnessScoreThreshold]),
      lim(limit, offset),
      groupBy('contracts.id'),
      // If user has contract-topic scores, use ONLY the defined topic scores when ranking
      // If the user has no contract-matching topic score, use only the contract's importance score
      orderBy(`case
      when bool_or(contracts.boosted) then avg(contracts.${sortByScore})
      when bool_or(uti.avg_conversion_score is not null)
      then avg(power(coalesce(uti.avg_conversion_score, ${GROUP_SCORE_PRIOR}), ${GROUP_SCORE_POWER}) * contracts.${sortByScore})
      else avg(contracts.${sortByScore}*${GROUP_SCORE_PRIOR})
      end * (1 + case
      when bool_or(contracts.creator_id = any(select follow_id from user_follows)) then 0.2
      else 0.0
      end)
      desc`)
    )
  )
  return forYou
}

export const basicSearchSQL = (
  args: SharedSearchArgs & {
    privateUser?: PrivateUser
  }
) => {
  const { sort, privateUser, ...rest } = args
  const sortByScore = sort === 'score' ? 'importance_score' : 'freshness_score'
  const userBetsJoin = args.hasBets === '1' && args.uid && userBetsJoinSql
  const sql = renderSql(
    select(contractColumnsToSelectWithPrefix('contracts')),
    from('contracts'),
    userBetsJoin,
    orderBy(`${sortByScore} desc`),
    getSearchContractWhereSQL({
      ...rest,
      hideStonks: true,
    }),
    privateUserBlocksSql(privateUser),
    lim(args.limit, args.offset)
  )
  return sql
}

export type SearchTypes =
  | 'without-stopwords'
  | 'with-stopwords'
  | 'description'
  | 'prefix'
  | 'answer'

export function getSearchContractSQL(
  args: SharedSearchArgs & {
    term: string
    groupId?: string
    isForYou?: boolean
    searchType: SearchTypes
    groupIds?: string[]
  }
) {
  const {
    term,
    sort,
    offset,
    limit,
    groupId,
    creatorId,
    searchType,
    token,
    groupIds,
    filter,
    uid,
    hasBets,
  } = args
  const hideStonks = sort === 'score' && !term.length && !groupId
  const hideLove = sort === 'newest' && !term.length && !groupId && !creatorId

  const whereSql = getSearchContractWhereSQL({ ...args, hideStonks, hideLove })
  const isUrl = term.startsWith('https://manifold.markets/')
  if (isUrl) {
    const slug = term.split('/').pop()
    return renderSql(
      select(contractColumnsToSelectWithPrefix('contracts')),
      from('contracts'),
      whereSql,
      where('slug = $1', [slug])
    )
  }

  const answersSubQuery = renderSql(
    select('distinct a.contract_id'),
    from('answers a'),
    where(`a.text_fts @@ websearch_to_tsquery('english_extended', $1)`, [term])
  )

  const groupsFilter =
    (groupIds?.length || groupId) &&
    where(
      `
    exists (
      select 1 from group_contracts gc 
      where ${
        token === 'CASH'
          ? "gc.contract_id = contracts.data->>'siblingContractId'"
          : 'gc.contract_id = contracts.id'
      }
      and gc.group_id = any($1)
    )`,
      [filterDefined([groupId, ...(groupIds ?? [])])]
    )

  // Recent movements filter
  const newsFilter =
    filter === 'news' &&
    withClause(
      `recent_movements as (
        select distinct contract_id
        from contract_movement_notifications
        where created_time > now() - interval '72 hours'
      )`
    )

  const newsJoin =
    filter === 'news' &&
    join(`recent_movements rm on rm.contract_id = contracts.id`)

  const newsWhere =
    filter === 'news' &&
    term === '' &&
    where(`coalesce(contracts.data->>'isRanked', 'true')::boolean = true`)

  const userBetsJoin = hasBets === '1' && uid && userBetsJoinSql
  // Normal full text search
  const sql = renderSql(
    select(contractColumnsToSelectWithPrefix('contracts')),
    from('contracts'),
    groupsFilter,
    newsFilter,
    newsJoin,
    newsWhere,
    userBetsJoin,
    searchType === 'answer' &&
      join(
        `(${answersSubQuery}) as matched_answers on matched_answers.contract_id = contracts.id`
      ),

    whereSql,
    term.length && [
      searchType === 'prefix' &&
        where(
          `question_fts @@ to_tsquery('english_extended', $1)`,
          constructPrefixTsQuery(term)
        ),
      searchType === 'without-stopwords' &&
        where(
          `question_fts @@ websearch_to_tsquery('english_extended', $1)`,
          term
        ),
      searchType === 'with-stopwords' &&
        where(
          `question_nostop_fts @@ websearch_to_tsquery('english_nostop_with_prefix', $1)`,
          term
        ),
      searchType === 'description' &&
        where(
          `description_fts @@ websearch_to_tsquery('english_extended', $1)`,
          term
        ),
    ],

    orderBy(getSearchContractSortSQL(sort)),
    sqlLimit(limit, offset)
  )
  // log('Search SQL:', sql)
  return sql
}

function getSearchContractWhereSQL(args: {
  filter: string
  sort?: string
  contractType: string
  creatorId?: string
  uid?: string
  hideStonks?: boolean
  hideLove?: boolean
  isPrizeMarket?: boolean
  token: TokenInputType
  liquidity?: number
  hasBets?: string
}) {
  const {
    filter,
    sort,
    contractType,
    creatorId,
    uid,
    hideStonks,
    hideLove,
    isPrizeMarket,
    token,
    liquidity,
    hasBets,
  } = args
  type FilterSQL = Record<string, string>
  const filterSQL: FilterSQL = {
    open: 'resolution_time IS NULL AND (close_time > NOW() or close_time is null)',
    closed: 'close_time < NOW() AND resolution_time IS NULL',
    'closing-day': `close_time > now() AND close_time < (now() + interval '1 day' + interval '7 hours') AND resolution_time IS NULL`,
    'closing-week': `close_time > now() AND close_time < (now() + interval '7 days' + interval '7 hours') AND resolution_time IS NULL`,
    'closing-month': `close_time > now() AND close_time < (now() + interval '30 days' + interval '7 hours') AND resolution_time IS NULL`,
    'closing-90-days': `close_time > now() AND close_time < (now() + interval '90 days' + interval '7 hours') AND resolution_time IS NULL`,
    resolved: 'resolution_time IS NOT NULL',
    news: '', // News filter uses a different approach with a join
    all: '',
  }
  const contractTypeFilter =
    contractType === 'ALL'
      ? ''
      : contractType === 'MULTIPLE_CHOICE'
      ? `outcome_type = 'FREE_RESPONSE' OR outcome_type = 'MULTIPLE_CHOICE'`
      : contractType === 'DEPENDENT_MULTIPLE_CHOICE'
      ? `outcome_type = 'MULTIPLE_CHOICE' AND coalesce((contracts.data->>'shouldAnswersSumToOne')::boolean, true) = true`
      : contractType === 'INDEPENDENT_MULTIPLE_CHOICE'
      ? `outcome_type = 'MULTIPLE_CHOICE' AND coalesce((contracts.data->>'shouldAnswersSumToOne')::boolean, true) = false`
      : contractType === 'PSEUDO_NUMERIC'
      ? `outcome_type = 'PSEUDO_NUMERIC' OR outcome_type = 'NUMBER' OR outcome_type = 'MULTI_NUMERIC'`
      : `outcome_type = '${contractType}'`

  const stonkFilter =
    hideStonks && contractType !== 'STONK' ? `outcome_type != 'STONK'` : ''
  const loveFilter = hideLove
    ? `group_slugs is null or not group_slugs && $1`
    : ''
  const sortFilter =
    sort === 'close-date'
      ? 'close_time > NOW()'
      : sort === '24-hour-vol'
      ? "(contracts.data->>'volume24Hours')::numeric > 0"
      : ''
  const creatorFilter = creatorId ? `creator_id = '${creatorId}'` : ''
  const visibilitySQL = getContractPrivacyWhereSQLFilter(
    uid,
    'contracts.id',
    creatorId
  )
  const answerLiquidity =
    answerCostTiers[getTierIndexFromLiquidity(liquidity ?? 0)]
  const liquidityFilter = liquidity
    ? `(
    CASE
        WHEN mechanism = 'cpmm-multi-1' AND jsonb_typeof(contracts.data->'answers') = 'array' AND jsonb_array_length(contracts.data->'answers') > 0
        THEN (coalesce((contracts.data->>'totalLiquidity')::numeric, 0) / jsonb_array_length(contracts.data->'answers'))
        ELSE coalesce((contracts.data->>'totalLiquidity')::numeric, 0)
    END
  ) >= case when mechanism = 'cpmm-multi-1' then ${answerLiquidity} else ${liquidity} end`
    : ''
  const deletedFilter = `deleted = false`

  const isPrizeMarketFilter = isPrizeMarket ? 'is_spice_payout = true' : ''
  // User bets filter
  const userBetsWhere =
    hasBets === '1' && uid && where('cm.user_id = $1', [uid])
  const tokenFilter =
    token === 'CASH'
      ? `token = 'CASH'`
      : token === 'MANA'
      ? `token = 'MANA'`
      : token === 'CASH_AND_MANA'
      ? `contracts.data->>'siblingContractId' is not null`
      : ''

  return [
    where(filterSQL[filter]),
    where(stonkFilter),
    where(loveFilter, [[PROD_MANIFOLD_LOVE_GROUP_SLUG]]),
    where(sortFilter),
    where(contractTypeFilter),
    where(liquidityFilter),
    where(visibilitySQL),
    where(creatorFilter),
    where(deletedFilter),
    where(isPrizeMarketFilter),
    where(tokenFilter),
    userBetsWhere,
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
    sql: `importance_score::numeric desc, unique_bettor_count`,
    sortCallback: (c: Contract) =>
      c.importanceScore > 0 ? c.importanceScore : c.uniqueBettorCount,
    order: 'DESC',
  },
  'daily-score': {
    sql: 'daily_score',
    sortCallback: (c: Contract) => c.dailyScore,
    order: 'DESC',
  },
  'freshness-score': {
    sql: 'freshness_score',
    sortCallback: (c: Contract) => c.freshnessScore,
    order: 'DESC',
  },
  '24-hour-vol': {
    sql: "(contracts.data->>'volume24Hours')::numeric",
    sortCallback: (c: Contract) => c.volume24Hours,
    order: 'DESC',
  },
  liquidity: {
    sql: "(contracts.data->>'elasticity')::numeric",
    sortCallback: (c: Contract) => c.elasticity,
    order: 'ASC',
  },
  subsidy: {
    sql: "COALESCE((contracts.data->>'totalLiquidity')::numeric, 0)",
    sortCallback: (c: Contract) =>
      c.mechanism === 'cpmm-1' || c.mechanism === 'cpmm-multi-1'
        ? c.totalLiquidity
        : 0,
    order: 'DESC',
  },

  'last-updated': {
    sql: 'last_updated_time',
    sortCallback: (c: Contract) => c.lastUpdatedTime,
    order: 'DESC',
  },
  'most-popular': {
    sql: 'unique_bettor_count',
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
  'start-time': {
    // sql: `close_time`,
    sql: `coalesce((contracts.data->>'sportsStartTimestamp')::timestamp with time zone, close_time)`,
    sortCallback: (c: Contract) =>
      isSportsContract(c)
        ? tsToMillis(c.sportsStartTimestamp)
        : c.closeTime ?? Infinity,
    order: 'ASC',
  },
  random: {
    sql: 'random()',
    sortCallback: () => Math.random(),
    order: 'DESC',
  },
  'bounty-amount': {
    sql: "COALESCE((contracts.data->>'bountyLeft')::numeric, -1)",
    sortCallback: (c: Contract) => ('bountyLeft' in c && c.bountyLeft) || -1,
    order: 'DESC',
  },
  'prob-descending': {
    sql: "resolution DESC, (contracts.data->>'p')::numeric",
    sortCallback: (c: Contract) => ('p' in c && c.p) || 0,
    order: 'DESC NULLS LAST',
  },
  'prob-ascending': {
    sql: "resolution DESC, (contracts.data->>'p')::numeric",
    sortCallback: (c: Contract) => ('p' in c && c.p) || 0,
    order: 'ASC',
  },
}
function getSearchContractSortSQL(sort: string) {
  return `${sortFields[sort].sql} ${sortFields[sort].order}`
}

const loadScoreThresholds = async (threshold: number) => {
  const pg = createSupabaseDirectClient()
  importanceScoreThreshold = await pg.one(
    `
        with ranked_contracts as (select importance_score,
                                         row_number() over (order by importance_score desc) as rn
                                  from contracts)
        select importance_score
        from ranked_contracts
        where rn = $1;`,
    [threshold],
    (r) => r.importance_score as number
  )
  freshnessScoreThreshold = await pg.one(
    `
        with ranked_contracts as (select freshness_score,
                                         row_number() over (order by freshness_score desc) as rn
                                  from contracts)
        select freshness_score
        from ranked_contracts
        where rn = $1;`,
    [threshold],
    (r) => r.freshness_score as number
  )
  log('Loaded importance score threshold:', importanceScoreThreshold)
  log('Loaded freshness score threshold:', freshnessScoreThreshold)
}

const loadRandomUser = async () => {
  const pg = createSupabaseDirectClient()
  return await pg.one(
    `SELECT user_id AS id FROM user_contract_interactions
    WHERE created_time > now() - interval '1 week' and created_time < now() - interval '5 days'
    ORDER BY random() LIMIT 1`,
    [],
    (r) => r.id as string
  )
}

export const privateUserBlocksSql = (privateUser?: PrivateUser) => {
  const {
    blockedByUserIds,
    blockedContractIds,
    blockedUserIds,
    blockedGroupSlugs,
  } = privateUser ?? {
    blockedByUserIds: [] as string[],
    blockedContractIds: [] as string[],
    blockedUserIds: [] as string[],
    blockedGroupSlugs: [] as string[],
  }
  const blockedIds = blockedUserIds.concat(blockedByUserIds)
  const blockedGroupsQuery = renderSql(
    select('1'),
    from(`group_contracts gc`),
    join(`groups g on gc.group_id = g.id`),
    where(`gc.contract_id = contracts.id`),
    where(`g.slug = any(array[$1])`, [blockedGroupSlugs])
  )
  return buildArray(
    blockedIds.length > 0 &&
      where(`contracts.creator_id <> all(array[$1])`, [blockedIds]),
    blockedContractIds.length > 0 &&
      where(`contracts.id <> all(array[$1])`, [blockedContractIds]),
    blockedGroupSlugs.length > 0 && where(`not exists (${blockedGroupsQuery})`)
  )
}

const userBetsJoinSql = join(
  `user_contract_metrics cm on cm.contract_id = contracts.id and cm.answer_id is null and cm.has_shares`
)
