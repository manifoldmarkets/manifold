import { BDL_KICKOFF_FUNDING } from 'common/bdl/constants'
import { BdlLeagueKey } from 'common/bdl/leagues'
import { MAJOR_LEAGUES, MajorLeague } from 'common/bdl/major-leagues'
import { SPORT_LEAGUE_LABEL } from 'common/sports-calendar'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import type {
  SupabaseDirectClient,
  SupabaseTransaction,
} from '../supabase/init'
import {
  SPORTS_CREATION_BUDGET_LOCK_SQL,
  getMajorSettings,
} from './major-settings'

export type BdlCreationLimits = {
  perLeagueDailyAnte: number | null
  perWaveAnte: number | null
  globalOpenAnte: number | null
}
export type BdlBudgetInput = {
  creatorId: string
  leagueKey: MajorLeague
  waveLeagueKeys: readonly BdlLeagueKey[]
  expectedBaseAnte: number
  limits: BdlCreationLimits
  ante: number
}
export type BdlBudgetPreview = {
  dailyAnte: number
  waveAnte: number
  openAnte: number
  balanceDebits: number
}
type BudgetReason =
  | 'budget-unconfigured'
  | 'settings-changed'
  | 'low-balance'
  | 'league-daily-cap'
  | 'wave-monthly-cap'
  | 'global-open-cap'
export type BdlCreationBudgetStatus = {
  reason: BudgetReason | null
  dailyAnte: number
  waveAnte: number
  openAnte: number
  balance: number
  remainingBalance: number
  lowBalance: boolean
}
export class BdlCreationBudgetError extends Error {
  constructor(readonly status: BdlCreationBudgetStatus) {
    super('BDL creation budget: ' + status.reason)
    this.name = 'BdlCreationBudgetError'
  }
}

const legacyMajorLeagueKeys = Object.fromEntries(
  MAJOR_LEAGUES.map((key) => [SPORT_LEAGUE_LABEL[key], key])
)
const emptyPreview: BdlBudgetPreview = {
  dailyAnte: 0,
  waveAnte: 0,
  openAnte: 0,
  balanceDebits: 0,
}
const nonnegative = (n: number) => Number.isFinite(n) && n >= 0
function checkInput(input: BdlBudgetInput, preview: BdlBudgetPreview) {
  if (!MANIFOLD_SPORTS_USER_IDS.includes(input.creatorId))
    throw new Error('Expected the sports funding account')
  if (
    !Number.isFinite(input.ante) ||
    input.ante <= 0 ||
    !Number.isFinite(input.expectedBaseAnte) ||
    input.expectedBaseAnte <= 0
  )
    throw new Error('Invalid BDL creation ante')
  if (!input.waveLeagueKeys.includes(input.leagueKey))
    throw new Error('BDL wave does not include this league')
  if (
    Object.values(input.limits).some((n) => n !== null && !nonnegative(n)) ||
    Object.values(preview).some((n) => !nonnegative(n))
  )
    throw new Error('Invalid BDL creation budget')
}

// The ledger records the actual initial ante. Later user liquidity, refunds and
// fees are separate transaction types. Closed but unresolved markets still tie up
// capital. The UTC periods use transaction time, the default on txns.created_time.
const budgetQuery = `with periods as (
  select date_trunc('day',now() at time zone 'UTC') as day,
         date_trunc('month',now() at time zone 'UTC') as month
), spent as (
  select coalesce(c.data->>'sportsLeagueKey', $14::jsonb ->> (c.data->>'sportsLeague')) as league, c.resolution, t.amount,
         t.created_time at time zone 'UTC' as charged
  from txns t join contracts c on c.id=t.to_id and c.creator_id=t.from_id
  where t.from_id=any($1) and t.category='CREATE_CONTRACT_ANTE' and t.token='M$'
    and t.from_type='USER' and t.to_type='CONTRACT'
    and c.token='MANA' and c.data->>'sportsEventId' is not null
), usage as (
  select coalesce(sum(amount) filter(where league=$2 and charged>=day and charged<day+interval '1 day'),0)+$3::numeric as daily,
         coalesce(sum(amount) filter(where league=any($4) and charged>=month and charged<month+interval '1 month'),0)+$5::numeric as wave,
         coalesce(sum(amount) filter(where resolution is null),0)+$6::numeric as open
  from spent cross join periods
  where resolution is null or (charged>=month and charged<month+interval '1 month')
), funding as (
  select usage.*, u.balance-$7::numeric as balance from usage join users u on u.id=$8
)
select daily::double precision as "dailyAnte", wave::double precision as "waveAnte",
       open::double precision as "openAnte", balance::double precision as balance,
       (balance-$9::numeric)::double precision as "remainingBalance",
       balance-$9::numeric < $13::numeric as "lowBalance",
       case when $10::numeric is null or $11::numeric is null or $12::numeric is null then 'budget-unconfigured'
            when balance < $9::numeric then 'low-balance'
            when daily+$9::numeric > $10::numeric then 'league-daily-cap'
            when wave+$9::numeric > $11::numeric then 'wave-monthly-cap'
            when open+$9::numeric > $12::numeric then 'global-open-cap'
       end as reason
from funding`

/** Read-only estimate. A dry run supplies the amounts its earlier proposals would have spent. */
export async function inspectBdlCreationBudget(
  pg: Pick<SupabaseDirectClient, 'oneOrNone'>,
  input: BdlBudgetInput,
  preview: BdlBudgetPreview = emptyPreview
): Promise<BdlCreationBudgetStatus> {
  checkInput(input, preview)
  const { limits } = input
  const result = await pg.oneOrNone<BdlCreationBudgetStatus>(budgetQuery, [
    MANIFOLD_SPORTS_USER_IDS,
    input.leagueKey,
    preview.dailyAnte,
    input.waveLeagueKeys,
    preview.waveAnte,
    preview.openAnte,
    preview.balanceDebits,
    input.creatorId,
    input.ante,
    limits.perLeagueDailyAnte,
    limits.perWaveAnte,
    limits.globalOpenAnte,
    BDL_KICKOFF_FUNDING.anteReserve,
    legacyMajorLeagueKeys,
  ])
  if (!result) throw new Error('BDL sports funding account is missing')
  if (
    ![
      result.dailyAnte,
      result.waveAnte,
      result.openAnte,
      result.balance,
      result.remainingBalance,
    ].every(Number.isFinite)
  )
    throw new Error('Nonfinite BDL funding ledger or balance')
  return result
}

/** Call in the same READ COMMITTED creation transaction as the debit and insert. */
export async function requireBdlCreationBudget(
  tx: SupabaseTransaction,
  input: BdlBudgetInput
): Promise<BdlCreationBudgetStatus> {
  checkInput(input, emptyPreview)
  // Serialize BDL creators across bot accounts before reading shared exposure.
  // A separate statement after this wait sees the preceding creator's commit.
  await tx.one(SPORTS_CREATION_BUDGET_LOCK_SQL)
  await tx.oneOrNone('select id from users where id=$1 for update', [
    input.creatorId,
  ])
  const fresh = await getMajorSettings(tx, input.leagueKey)
  const status = await inspectBdlCreationBudget(tx, {
    ...input,
    limits: fresh?.limits ?? input.limits,
  })
  if (!fresh) status.reason = 'budget-unconfigured'
  else if (
    fresh.baseAnte !== input.expectedBaseAnte ||
    fresh.waveLeagueKeys.length !== input.waveLeagueKeys.length ||
    !fresh.waveLeagueKeys.every((league) =>
      input.waveLeagueKeys.includes(league)
    )
  )
    status.reason = 'settings-changed'
  if (status.reason) throw new BdlCreationBudgetError(status)
  return status
}
