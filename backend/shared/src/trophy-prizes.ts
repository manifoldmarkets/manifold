// Paying trophy prizes (common/src/trophy-prizes.ts): shared by claim-trophy
// and the nightly rank job.
//
// A prize is recorded as one user_trophy_rewards row and paid once:
// - payTrophyPrizes runs inside the caller's transaction, with the user's row
//   locked. It inserts the rows, pays mana and freezes for the rows it
//   inserted, and leaves membership days 'pending'.
// - settleTrophyMembershipPrizes runs after commit, outside any transaction
//   and outside the user's bet queue slot (grantMembershipDays takes that
//   slot itself). It grants each pending part and records the outcome. A part
//   that fails stays pending for the next caller: the next claim, or the
//   scheduler's settle-trophy-prizes sweep. The grant is keyed by the row, so
//   no number of retries grants twice. An account's parts are granted best
//   tier first and the pass stops at its first failure, so a lesser prize
//   can't take the room under the holding cap that a better one is owed.
//   The days can be granted minutes or hours after the prize was judged, so
//   the account is checked again first (canStillGrantMembership): one that
//   could no longer be paid has the part recorded as skipped instead.
//
// Free days count towards the 30-day holding cap, and what doesn't fit is
// lost. Behind free days that are already running, the room under a full cap
// is only the time that has passed since it filled. A grant of those seconds
// would still be banked, started and announced like any other, so under an
// hour of room counts as none and no grant is made (MIN_GRANT_ROOM_MS).

import { groupBy, sortBy, sumBy } from 'lodash'

import { getBanTypesForAction, isUserBanned } from 'common/ban-utils'
import { BANNED_TRADING_USER_IDS } from 'common/envs/constants'
import {
  MembershipGrantResult,
  capGrantDuration,
} from 'common/membership-grants'
import {
  EffectiveTier,
  SUPPORTER_ENTITLEMENT_IDS,
  SUPPORTER_TIERS,
  SupporterTier,
  TIER_ORDER,
} from 'common/supporter-config'
import {
  TrophyMembershipOutcome,
  TrophyMembershipResult,
  getRankPrizeTierFromRewardId,
  getTrophyPrizeStanding,
  isPrizeStandingCut,
  resolveTrophyPrizeTier,
} from 'common/trophies'
import { TrophyMembershipPrize, TrophyPrizeTotal } from 'common/trophy-prizes'
import { TrophyRewardTxn } from 'common/txn'
import { User, UserBan } from 'common/user'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { grantMembershipDays } from './membership-grants'
import { log } from './monitoring/log'
import {
  activeSupporterAccessSql,
  getActiveSupporterEntitlements,
} from './supabase/entitlements'
import { heldGrants } from './supabase/membership-grants'
import {
  SupabaseDirectClient,
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from './supabase/init'
import { UserUpdate } from './supabase/users'
import { runTxnOutsideBetQueue } from './txn/run-txn'

export type TrophyPrizeToPay = {
  // user_trophy_rewards.milestone_id: a milestone id, or a rank title prize
  // id (getRankPrizeRewardId).
  rewardId: string
  // For the txn description.
  name: string
  // Mana before the account's multiplier, for the txn record.
  baseMana: number
  // What this account collects, after its standing.
  prize: TrophyPrizeTotal
}

type MembershipPart = {
  // null when a 'paid-tier' prize found no paid membership.
  tier: SupporterTier | null
  days: number
  status: 'pending' | 'skipped'
}

type RewardRow = {
  reward_id: string
  name: string
  base_mana: number
  mana: number
  freezes: number
  membership_tier: SupporterTier | null
  membership_days: number | null
  membership_status: 'none' | MembershipPart['status']
}

export type PaidTrophyPrizes = {
  // The rows this call inserted, so the prizes it paid.
  paidRewardIds: string[]
  mana: number
  freezes: number
  // Membership days of those prizes, as recorded: 'pending' until granted.
  membership: ({ rewardId: string } & MembershipPart)[]
  // The account's freezes after the payout, when it added any.
  streakForgiveness: number | null
  // Prizes left unpaid because they are days of a paid membership the account
  // doesn't have. They can be collected once it does.
  unpaidForPaidTier: TrophyMembershipPrize[]
}

export const NO_TROPHY_PRIZES_PAID: PaidTrophyPrizes = {
  paidRewardIds: [],
  mana: 0,
  freezes: 0,
  membership: [],
  streakForgiveness: null,
  unpaidForPaidTier: [],
}

// Accounts banned from trading before user_bans existed. They have no ban
// row, so every payout path checks the list as well: no prizes, as for bots.
export const isLegacyBannedTrader = (userId: string) =>
  BANNED_TRADING_USER_IDS.includes(userId)

type BonusEligibility = NonNullable<User['bonusEligibility']>
const BONUS_ELIGIBILITY_VALUES: BonusEligibility[] = [
  'verified',
  'grandfathered',
  'eligible',
  'ineligible',
  'requires_verification',
]

/**
 * The account's effective tier and what it collects of a prize. A membership
 * the account pays for takes precedence over a flag and collects the full
 * prize. Free membership days don't: see resolveTrophyPrizeTier. Otherwise
 * flagged accounts get nothing and bonus-blocked ones get reduced mana and no
 * membership days (getPrizeStanding).
 *
 * `bonusEligibility` is users.data->>'bonusEligibility'. A payout reads it
 * under the user's row lock.
 */
export async function getAccountPrizeStanding(
  tx: SupabaseDirectClient,
  userId: string,
  bonusEligibility: string | null
) {
  const eligibility = BONUS_ELIGIBILITY_VALUES.find(
    (v) => v === bonusEligibility
  )
  const entitlements = await getActiveSupporterEntitlements(tx, userId)
  const effectiveTier = resolveTrophyPrizeTier({
    entitlements,
    bonusEligibility: eligibility,
    // Only a flagged or bonus-blocked account needs the answer.
    hasPaidMembership:
      isPrizeStandingCut(eligibility) &&
      !!(await getPaidSupporterTier(tx, userId)),
  })
  return { effectiveTier, standing: getTrophyPrizeStanding(effectiveTier) }
}

/**
 * Records and pays prizes in the caller's transaction, which must hold the
 * user's row lock. A prize whose row already exists was paid before and is
 * skipped. Membership days are left pending: call
 * settleTrophyMembershipPrizes after the transaction commits.
 */
export async function payTrophyPrizes(
  tx: SupabaseTransaction,
  input: {
    userId: string
    trophyId: string
    prizes: TrophyPrizeToPay[]
    effectiveTier: EffectiveTier
    multiplier: number
    describe: (names: string[]) => string
    // Balance updates to broadcast once the transaction has committed.
    onUserUpdates: (updates: UserUpdate[]) => void
  }
): Promise<PaidTrophyPrizes> {
  const { userId, trophyId, prizes, effectiveTier, multiplier } = input
  // Only inserted ids come back from the insert below: a repeated id would
  // be paid once for every copy.
  if (new Set(prizes.map((p) => p.rewardId)).size !== prizes.length)
    throw new Error(`Repeated trophy prize for ${trophyId}`)

  const needsPaidTier = prizes.some((p) =>
    p.prize.membership.some((m) => m.tier === 'paid-tier')
  )
  const paidTier = needsPaidTier ? await getPaidSupporterTier(tx, userId) : null

  const unpaidForPaidTier: TrophyMembershipPrize[] = []
  const rows: RewardRow[] = []
  for (const { rewardId, name, baseMana, prize } of prizes) {
    const { mana, freezes } = prize
    if (!Number.isFinite(mana) || mana < 0)
      throw new Error(`Invalid trophy prize mana for ${trophyId}/${rewardId}`)
    if (!Number.isInteger(freezes) || freezes < 0)
      throw new Error(
        `Invalid trophy prize freezes for ${trophyId}/${rewardId}`
      )
    // One milestone or rank title has one membership prize at most.
    if (prize.membership.length > 1)
      throw new Error(
        `More than one membership prize for ${trophyId}/${rewardId}`
      )
    const membership = toMembershipPart(prize.membership[0], paidTier)
    if (
      membership &&
      (!Number.isInteger(membership.days) || membership.days <= 0)
    )
      throw new Error(`Invalid trophy prize days for ${trophyId}/${rewardId}`)

    // A prize that would pay nothing is not recorded, so it stays collectable.
    if (!(mana > 0) && !(freezes > 0) && membership?.status !== 'pending') {
      if (membership) unpaidForPaidTier.push(prize.membership[0])
      continue
    }
    rows.push({
      reward_id: rewardId,
      name,
      base_mana: baseMana,
      mana,
      freezes,
      membership_tier: membership?.tier ?? null,
      membership_days: membership?.days ?? null,
      membership_status: membership?.status ?? 'none',
    })
  }
  if (!rows.length) return { ...NO_TROPHY_PRIZES_PAID, unpaidForPaidTier }

  // The rows are never deleted, so a prize pays once even if its claim is
  // removed and made again. Only the rows inserted here are paid.
  const inserted = await tx.manyOrNone<{ milestone_id: string }>(
    `insert into user_trophy_rewards
       (user_id, trophy_id, milestone_id, mana, freezes, effective_tier,
        membership_tier, membership_days, membership_status)
     select $[userId], $[trophyId], r.reward_id, r.mana, r.freezes, $[effectiveTier],
       r.membership_tier, r.membership_days, r.membership_status
     from jsonb_to_recordset($[rows:json]::jsonb) as r(
       reward_id text, mana numeric, freezes int,
       membership_tier text, membership_days int, membership_status text)
     on conflict (user_id, trophy_id, milestone_id) do nothing
     returning milestone_id`,
    { userId, trophyId, effectiveTier, rows }
  )
  const insertedIds = new Set(inserted.map((r) => r.milestone_id))
  const paid = rows.filter((r) => insertedIds.has(r.reward_id))
  if (!paid.length) return { ...NO_TROPHY_PRIZES_PAID, unpaidForPaidTier }

  const mana = Math.round(sumBy(paid, 'mana') * 100) / 100
  if (!Number.isFinite(mana)) throw new Error('Invalid trophy prize total')
  const freezes = sumBy(paid, 'freezes')
  if (mana > 0) {
    const withMana = paid.filter((r) => r.mana > 0)
    const rewardTxn: Omit<TrophyRewardTxn, 'id' | 'createdTime'> = {
      fromId: 'BANK',
      fromType: 'BANK',
      toId: userId,
      toType: 'USER',
      amount: mana,
      token: 'M$',
      category: 'TROPHY_REWARD',
      description: input.describe(withMana.map((r) => r.name)),
      data: {
        trophyId,
        milestoneIds: withMana.map((r) => r.reward_id),
        baseAmount: sumBy(withMana, 'base_mana'),
        effectiveTier,
        multiplier,
        freezes,
        membership: paid
          .filter((r) => r.membership_status !== 'none')
          .map((r) => ({
            milestoneId: r.reward_id,
            tier: r.membership_tier,
            days: r.membership_days ?? 0,
          })),
      },
    }
    // The user row is locked by the caller, so don't queue.
    const txn = await runTxnOutsideBetQueue(
      tx,
      rewardTxn,
      false,
      input.onUserUpdates
    )
    await tx.none(
      `update user_trophy_rewards set txn_id = $4
       where user_id = $1 and trophy_id = $2 and milestone_id = any($3::text[])`,
      [userId, trophyId, withMana.map((r) => r.reward_id), txn.id]
    )
  }

  // No cap: the shop's limit on held freezes applies to purchases only.
  const streakForgiveness =
    freezes > 0
      ? (
          await tx.one<{ streak_forgiveness: number }>(
            `update users set data = jsonb_set(
               coalesce(data, '{}'::jsonb), '{streakForgiveness}',
               to_jsonb(coalesce(floor((data->>'streakForgiveness')::numeric), 0)::int + $2::int))
             where id = $1
             returning (data->>'streakForgiveness')::int as streak_forgiveness`,
            [userId, freezes]
          )
        ).streak_forgiveness
      : null

  return {
    paidRewardIds: paid.map((r) => r.reward_id),
    mana,
    freezes,
    membership: paid.flatMap((r) =>
      r.membership_status === 'none'
        ? []
        : [
            {
              rewardId: r.reward_id,
              tier: r.membership_tier,
              days: r.membership_days ?? 0,
              status: r.membership_status,
            },
          ]
    ),
    streakForgiveness,
    unpaidForPaidTier,
  }
}

function toMembershipPart(
  prize: TrophyMembershipPrize | undefined,
  paidTier: SupporterTier | null
): MembershipPart | null {
  if (!prize) return null
  const tier = prize.tier === 'paid-tier' ? paidTier : prize.tier
  return { tier, days: prize.days, status: tier ? 'pending' : 'skipped' }
}

/**
 * The tier of the membership the account pays for, or null. Free membership
 * days don't count: while they run the supporter row belongs to the grant
 * (metadata.membershipGrantId) and the paid membership waits in the grant's
 * paused_paid, where it counts while it has paid time left.
 *
 * One statement, so one snapshot: a grant that ends between two reads would
 * move the paid membership from one place to the other and show in neither.
 */
export async function getPaidSupporterTier(
  tx: SupabaseDirectClient,
  userId: string
): Promise<SupporterTier | null> {
  const rows = await tx.manyOrNone<{ tier: string | null }>(
    `select substr(entitlement_id, length('supporter-') + 1) as tier
     from user_entitlements
     where user_id = $1 and entitlement_id = any($2)
       and metadata->>'membershipGrantId' is null
       and ${activeSupporterAccessSql}
     union all
     select paused_paid->>'tier' as tier
     from membership_grants
     where user_id = $1 and status = 'active'
       and (paused_paid->>'remainingMs')::numeric > 0
       and coalesce((paused_paid->>'enabled')::boolean, true)`,
    [userId, SUPPORTER_ENTITLEMENT_IDS]
  )
  const paid = new Set(rows.map((r) => r.tier))
  return (
    sortBy(
      TIER_ORDER.filter((tier) => paid.has(tier)),
      (tier) => -SUPPORTER_TIERS[tier].order
    )[0] ?? null
  )
}

type PendingRow = {
  user_id: string
  trophy_id: string
  milestone_id: string
  membership_tier: SupporterTier
  membership_days: number
}

export type SettledTrophyMembership = {
  userId: string
  trophyId: string
  rewardId: string
  // 'skipped': the account could no longer be paid, so no grant was made.
  outcome: GrantedOutcome | 'skipped'
}

type GrantedOutcome = Exclude<TrophyMembershipOutcome, 'pending' | 'skipped'>

/**
 * Grants the pending membership days of paid prizes: one user's, or those of
 * up to `maxUsers` accounts with a part that is due. An account that can no
 * longer be paid has its parts recorded as skipped. A part is due once it is
 * `minAgeMs` old (the sweep leaves fresh ones to the request that wrote
 * them), or at the time a failed pass put it off to. Never throws: a part
 * that fails is logged and stays pending, with the account's other parts.
 * `failed` counts the accounts left with pending parts.
 *
 * Call it outside any transaction and outside the user's bet queue slot.
 */
export async function settleTrophyMembershipPrizes(
  pg: SupabaseDirectClientTimeout,
  scope: { userId: string } | { minAgeMs: number; maxUsers: number }
): Promise<{ settled: SettledTrophyMembership[]; failed: number }> {
  const settled: SettledTrophyMembership[] = []
  let failed = 0
  let pending: PendingRow[]
  try {
    pending =
      'userId' in scope
        ? await pg.manyOrNone<PendingRow>(
            `select user_id, trophy_id, milestone_id, membership_tier, membership_days
             from user_trophy_rewards
             where membership_status = 'pending' and user_id = $1`,
            [scope.userId]
          )
        : // Whole accounts, so the limit can't split one account's parts and
          // grant them out of order.
          await pg.manyOrNone<PendingRow>(
            `select user_id, trophy_id, milestone_id, membership_tier, membership_days
             from user_trophy_rewards
             where membership_status = 'pending' and user_id in (
               select user_id from user_trophy_rewards
               where membership_status = 'pending'
               group by user_id
               having min(coalesce(membership_next_attempt_time,
                 created_time + make_interval(secs => $1))) <= now()
               order by min(created_time)
               limit $2)`,
            [scope.minAgeMs / 1000, scope.maxUsers]
          )
  } catch (error) {
    log.error('Failed to read pending trophy membership prizes', { error })
    return { settled, failed: 1 }
  }

  for (const [userId, rows] of Object.entries(groupBy(pending, 'user_id'))) {
    // The holding cap can cut later grants short, so the best tier goes first.
    const ordered = sortBy(
      rows,
      (r) => -(SUPPORTER_TIERS[r.membership_tier]?.order ?? 0),
      (r) => -r.membership_days
    )
    // Checked once a pass for each kind of prize, not once a part: a claim
    // of a whole ladder has eight.
    const checks = new Map<boolean, Promise<boolean>>()
    const canGrant = (isRankPrize: boolean) => {
      const check =
        checks.get(isRankPrize) ??
        canStillGrantMembership(pg, userId, isRankPrize)
      checks.set(isRankPrize, check)
      return check
    }
    for (const row of ordered) {
      try {
        const outcome = await settleRow(pg, row, canGrant)
        settled.push({
          userId,
          trophyId: row.trophy_id,
          rewardId: row.milestone_id,
          outcome,
        })
      } catch (error) {
        failed++
        log.error('Failed to grant trophy membership days; left pending', {
          userId,
          trophyId: row.trophy_id,
          rewardId: row.milestone_id,
          error: error instanceof Error ? error.message : String(error),
        })
        await postponePending(pg, userId)
        // The parts after this one wait with it, to keep their order.
        break
      }
    }
  }
  return { settled, failed }
}

// The sweep tries the account again in 2, 4, 8... minutes, up to 6 hours, so
// parts that keep failing can't crowd out everyone else's. A claim by the
// account retries at once.
async function postponePending(
  pg: SupabaseDirectClientTimeout,
  userId: string
) {
  try {
    await pg.none(
      `update user_trophy_rewards
       set membership_attempts = membership_attempts + 1,
         membership_next_attempt_time =
           now() + least(power(2, membership_attempts + 1), 360) * interval '1 minute'
       where user_id = $1 and membership_status = 'pending'`,
      [userId]
    )
  } catch (error) {
    log.error('Failed to postpone pending trophy membership prizes', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Less room than this under the holding cap counts as none.
export const MIN_GRANT_ROOM_MS = HOUR_MS

async function settleRow(
  pg: SupabaseDirectClientTimeout,
  row: PendingRow,
  canGrant: (isRankPrize: boolean) => Promise<boolean>
): Promise<SettledTrophyMembership['outcome']> {
  const { user_id, trophy_id, milestone_id, membership_tier } = row
  const days = row.membership_days
  if (!TIER_ORDER.includes(membership_tier) || !(days > 0))
    throw new Error('Invalid pending trophy membership prize')
  const rankTier = getRankPrizeTierFromRewardId(milestone_id)
  const durationMs = days * DAY_MS
  const source = rankTier ? 'trophy-rank' : 'trophy'
  const sourceId = `${trophy_id}/${rankTier ?? milestone_id}`
  const key = [user_id, trophy_id, milestone_id]

  // An earlier attempt may have made the grant and died before recording it.
  // Then the grant below returns it, whatever room is left now.
  const granted = await pg.oneOrNone(
    `select 1 from membership_grants
     where user_id = $1 and source = $2 and source_id = $3`,
    [user_id, source, sourceId]
  )
  if (!granted && !(await canGrant(!!rankTier))) {
    // Final: the part is not granted later if the account recovers. As with
    // the cap below, a grant that has appeared since is left to its maker.
    await pg.none(
      `update user_trophy_rewards
       set membership_status = 'skipped', membership_settled_time = now()
       where user_id = $1 and trophy_id = $2 and milestone_id = $3
         and membership_status = 'pending'
         and not exists (
           select 1 from membership_grants g
           where g.user_id = $1 and g.source = $4 and g.source_id = $5)`,
      [...key, source, sourceId]
    )
    return 'skipped'
  }
  if (!granted && !(await hasRoomUnderCap(pg, user_id, durationMs))) {
    // No grant is made, so this row is the receipt. If a grant for it has
    // appeared since the check above, its maker records the outcome instead.
    await pg.none(
      `update user_trophy_rewards
       set membership_status = 'granted', membership_outcome = 'capped',
         membership_granted_ms = 0, membership_settled_time = now()
       where user_id = $1 and trophy_id = $2 and milestone_id = $3
         and membership_status = 'pending'
         and not exists (
           select 1 from membership_grants g
           where g.user_id = $1 and g.source = $4 and g.source_id = $5)`,
      [...key, source, sourceId]
    )
    return 'capped'
  }

  const result = await grantMembershipDays(pg, {
    userId: user_id,
    tier: membership_tier,
    durationMs,
    source,
    sourceId,
    note: `Trophy prize ${trophy_id}/${milestone_id}.`,
  })
  const outcome = getGrantedOutcome(result)
  // Only a pending row is marked, so whichever caller grants first records
  // the outcome and a slower duplicate changes nothing. A grant that was made
  // also corrects a row another pass marked capped or skipped without one
  // (a row skipped at claim time has no tier, and no grant to record).
  await pg.none(
    `update user_trophy_rewards
     set membership_status = 'granted', membership_outcome = $4,
       membership_granted_ms = $5, membership_grant_id = $6::bigint,
       membership_settled_time = now()
     where user_id = $1 and trophy_id = $2 and milestone_id = $3
       and (membership_status = 'pending'
         or (membership_outcome = 'capped' and membership_grant_id is null)
         or (membership_status = 'skipped' and membership_tier is not null))`,
    [
      ...key,
      outcome,
      outcome === 'capped' ? 0 : result.grant.durationMs,
      result.grant.id,
    ]
  )
  return outcome
}

/**
 * Whether the account can still be granted the membership days of a prize.
 * The prize was judged when it was paid, but a grant that failed then is made
 * later, and by then the account may be a bot, deleted, banned, flagged or
 * bonus-blocked, or (for a rank title) kept out of the ranks. The rules are
 * those of the payout itself: claim-trophy's for a milestone, the rank job's
 * for a rank title.
 */
async function canStillGrantMembership(
  pg: SupabaseDirectClientTimeout,
  userId: string,
  isRankPrize: boolean
) {
  if (isLegacyBannedTrader(userId)) return false
  const user = await pg.oneOrNone<{
    bonus_eligibility: string | null
    is_bot: boolean
    user_deleted: boolean
    excluded: boolean
  }>(
    `select data->>'bonusEligibility' as bonus_eligibility,
       coalesce(is_bot, false) as is_bot,
       coalesce((data->>'userDeleted')::boolean, false) as user_deleted,
       exists (
         select 1 from trophy_rank_exclusions e where e.user_id = users.id
       ) as excluded
     from users where id = $1`,
    [userId]
  )
  if (!user || user.is_bot || user.user_deleted) return false
  if (isRankPrize && user.excluded) return false

  const bans = await pg.manyOrNone<UserBan>(
    `select * from user_bans where user_id = $1 and ended_at is null
       and (end_time is null or end_time > now())`,
    [userId]
  )
  const banned = isRankPrize
    ? // TROPHY_PERSON_FILTER: any ban but a mod alert.
      bans.some((ban) => ban.ban_type !== 'modAlert')
    : getBanTypesForAction('claimTrophy').some((type) =>
        isUserBanned(bans, type)
      )
  if (banned) return false

  const { standing } = await getAccountPrizeStanding(
    pg,
    userId,
    user.bonus_eligibility
  )
  return standing.membership
}

async function hasRoomUnderCap(
  pg: SupabaseDirectClientTimeout,
  userId: string,
  durationMs: number
) {
  const held = await heldGrants(pg, userId)
  const { now } = await pg.one<{ now: number }>(
    `select (extract(epoch from now()) * 1000)::float8 as now`
  )
  const nowMs = Math.trunc(Number(now))
  if (!Number.isFinite(nowMs)) throw new Error('Invalid database time')
  const room = capGrantDuration(durationMs, held, nowMs).durationMs
  return room >= Math.min(durationMs, MIN_GRANT_ROOM_MS)
}

// A retry finds the grant an earlier attempt made ('duplicate'). Report what
// became of that grant, so the row records the same outcome either way.
function getGrantedOutcome(result: MembershipGrantResult): GrantedOutcome {
  if (result.outcome !== 'duplicate') return result.outcome
  const { status, durationMs } = result.grant
  if (status === 'active') return 'started'
  if (status === 'banked') return 'banked'
  if (status === 'used' && durationMs === 0) return 'capped'
  return 'duplicate'
}

/** What became of the membership days of these paid prizes, by reward id. */
export async function getTrophyMembershipResults(
  pg: SupabaseDirectClientTimeout | SupabaseTransaction,
  userId: string,
  trophyId: string,
  rewardIds: string[]
): Promise<Map<string, TrophyMembershipResult>> {
  if (!rewardIds.length) return new Map()
  const rows = await pg.manyOrNone<{
    milestone_id: string
    membership_tier: SupporterTier | null
    membership_days: number
    membership_status: 'pending' | 'granted' | 'skipped'
    membership_outcome: GrantedOutcome | null
    membership_granted_ms: number | null
  }>(
    `select milestone_id, membership_tier, membership_days, membership_status,
       membership_outcome, membership_granted_ms
     from user_trophy_rewards
     where user_id = $1 and trophy_id = $2 and milestone_id = any($3::text[])
       and membership_status <> 'none'`,
    [userId, trophyId, rewardIds]
  )
  return new Map(
    rows.map((r) => {
      const grantedMs = Number(r.membership_granted_ms ?? 0)
      return [
        r.milestone_id,
        {
          tier: r.membership_tier ?? 'paid-tier',
          days: r.membership_days,
          grantedDays: Number.isFinite(grantedMs) ? grantedMs / DAY_MS : 0,
          outcome:
            r.membership_status === 'granted'
              ? r.membership_outcome ?? 'duplicate'
              : r.membership_status,
        },
      ]
    })
  )
}
