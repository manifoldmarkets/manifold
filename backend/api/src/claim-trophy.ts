import { APIError, APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import {
  assertOwnProfile,
  convertTrophyClaim,
  getRewardedMilestones,
  getStarterStats,
  getTrophyClaims,
} from 'api/helpers/trophies'
import {
  PUSH_BONUS_MILESTONE,
  TrophyClaimPrize,
  TrophyDefinition,
  TrophyMembershipResult,
  TrophyMilestonePrize,
  formatTrophyValue,
  getClaimedMilestonesUpTo,
  getMilestone,
  getMilestonePrizesFor,
  getMilestonesToClaim,
  getTrophyDefinition,
  getTrophyStatValue,
  isStarterTrophy,
  isStarterTrophyAccount,
} from 'common/trophies'
import { isEmptyPrizeTotal } from 'common/trophy-prizes'
import { getBanTypesForAction, isUserBanned } from 'common/ban-utils'
import { UserBan } from 'common/user'
import { log } from 'shared/monitoring/log'
import {
  SupabaseDirectClient,
  SupabaseTransaction,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  TROPHY_FRESH_PORTFOLIO_FILTER,
  TROPHY_NET_WORTH_PEAK_CONFLICT,
  TROPHY_SNAPSHOT_NET_WORTH,
} from 'shared/supabase/trophy-eligibility'
import { UserUpdate, broadcastUserUpdates } from 'shared/supabase/users'
import {
  NO_TROPHY_PRIZES_PAID,
  PaidTrophyPrizes,
  getAccountPrizeStanding,
  getTrophyMembershipResults,
  isLegacyBannedTrader,
  payTrophyPrizes,
  settleTrophyMembershipPrizes,
} from 'shared/trophy-prizes'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'
import { loadUserAchievements } from './get-user-achievements'

export const claimTrophy: APIHandler<'claim-trophy'> =
  onlyUsersWhoCanPerformAction(
    'claimTrophy',
    async ({ userId, trophyId, milestoneId }, auth) => {
      assertOwnProfile(userId, auth)
      const def = getTrophyDefinition(trophyId)
      if (!def) throw new APIError(404, 'Trophy not found')
      const milestone = getMilestone(def, milestoneId)
      if (!milestone) throw new APIError(404, 'Milestone not found')

      const pg = createSupabaseDirectClient()
      const user = await pg.oneOrNone<{ created_time: Date }>(
        `select created_time from users where id = $1`,
        [auth.uid]
      )
      if (!user) throw new APIError(404, 'User not found')
      const isStarterAccount = isStarterTrophyAccount(
        new Date(user.created_time).valueOf()
      )
      if (isStarterTrophy(def) && !isStarterAccount) {
        throw new APIError(403, 'These trophies are for new accounts')
      }

      const milestonesForValue = (value: number) => {
        const toClaim = getMilestonesToClaim(def, milestoneId, value)
        if (toClaim) return toClaim
        const needed =
          def.unit === 'league' || def.unit === 'years'
            ? formatTrophyValue(def, milestone.threshold)
            : `${milestone.threshold.toLocaleString()} ${def.unit}`
        throw new APIError(
          403,
          `You haven't reached ${milestone.name} yet: it needs ${needed}`
        )
      }
      // A milestone claimed earlier keeps its prize: collecting it needs no
      // new proof, though the stat may have dropped since (a deleted market,
      // a lost referral). Net Worth is the exception. A tier pays only while
      // the account is at or above it, and the transaction checks the
      // snapshot it records.
      const isNetWorth = def.id === 'net-worth'
      const collecting =
        !isNetWorth &&
        (await readClaimedMilestoneIds(pg, auth.uid, def.id)).has(milestoneId)
      const verifiedMilestones =
        isNetWorth || collecting
          ? undefined
          : milestonesForValue(await getStatValue(def, auth.uid))

      const userUpdates: UserUpdate[] = []
      const { inserted, paid } = await pg.tx(async (tx) => {
        // Lock the user first, as quest rewards do.
        const locked = await tx.one<{
          bonus_eligibility: string | null
          user_deleted: boolean
          is_bot: boolean
        }>(
          `select data->>'bonusEligibility' as bonus_eligibility,
             coalesce((data->>'userDeleted')::boolean, false) as user_deleted,
             coalesce(is_bot, false) as is_bot
           from users where id = $1 for no key update`,
          [auth.uid]
        )
        // Checked again under the lock: a deletion or ban committed since the
        // check at the start of the request must stop the payout too.
        if (locked.user_deleted) {
          throw new APIError(403, 'Your account has been deleted')
        }
        const bans = await tx.manyOrNone<UserBan>(
          `select * from user_bans where user_id = $1 and ended_at is null
             and (end_time is null or end_time > now())`,
          [auth.uid]
        )
        if (
          getBanTypesForAction('claimTrophy').some((type) =>
            isUserBanned(bans, type)
          )
        ) {
          throw new APIError(403, 'You are banned from claiming trophies')
        }

        let toClaim = verifiedMilestones
        if (collecting) {
          // Only what is claimed, read again under the lock: never a lower
          // milestone that isn't, which would need the stat checked.
          const claimed = await readClaimedMilestoneIds(tx, auth.uid, def.id)
          if (!claimed.has(milestoneId)) {
            throw new APIError(
              409,
              `${milestone.name} is no longer claimed. Reload and claim it again.`
            )
          }
          toClaim = getClaimedMilestonesUpTo(def, milestone, claimed)
        }
        toClaim ??= milestonesForValue(
          await readNetWorthAndRecordPeak(tx, auth.uid)
        )

        // One row per milestone. A repeated or concurrent claim inserts
        // nothing the second time, and a claim can never be lowered.
        const inserted = await tx.manyOrNone<{
          trophy_id: string
          milestone_id: string
          claimed_time: Date
        }>(
          `insert into user_trophy_milestones (user_id, trophy_id, milestone_id)
           select $1, $2, unnest($3::text[])
           on conflict (user_id, trophy_id, milestone_id) do nothing
           returning trophy_id, milestone_id, claimed_time`,
          [auth.uid, def.id, toClaim.map((m) => m.id)]
        )

        // Bots can claim, but get no prizes. Nor do the accounts banned from
        // trading before user_bans existed, which have no ban row to stop
        // them above.
        if (locked.is_bot || isLegacyBannedTrader(auth.uid)) {
          return { inserted, paid: NO_TROPHY_PRIZES_PAID }
        }

        const { effectiveTier, standing } = await getAccountPrizeStanding(
          tx,
          auth.uid,
          locked.bonus_eligibility
        )
        // A milestone that would pay this account nothing is left out: it
        // stays unpaid rather than used up, so claiming again (directly, or
        // via a higher milestone) pays it if the account's standing changes.
        const prizes = await withoutRepeatedPushBonus(
          tx,
          auth.uid,
          def,
          getMilestonePrizesFor(def, toClaim, { isStarterAccount, standing })
        )
        if (!prizes.length) return { inserted, paid: NO_TROPHY_PRIZES_PAID }

        // Mana and freezes are paid here. Membership days are only marked
        // pending: they are granted below, once this has committed.
        const paid = await payTrophyPrizes(tx, {
          userId: auth.uid,
          trophyId: def.id,
          prizes: prizes.map(({ milestone, base, prize }) => ({
            rewardId: milestone.id,
            name: milestone.name,
            baseMana: base.mana,
            prize,
          })),
          effectiveTier,
          multiplier: standing.manaMultiplier,
          describe: (names) => `Trophy reward: ${names.join(', ')}`,
          // Balance updates are broadcast after commit.
          onUserUpdates: (u) => userUpdates.push(...u),
        })
        return { inserted, paid }
      })
      if (userUpdates.length) broadcastUserUpdates(userUpdates)
      if (paid.streakForgiveness !== null) {
        broadcastUpdatedUser({
          id: auth.uid,
          streakForgiveness: paid.streakForgiveness,
        })
      }

      // Granting membership days takes the user's bet queue slot and its own
      // transaction, so it runs here: after commit, outside both. This also
      // retries any part an earlier claim left pending. A part that fails now
      // stays pending for the next claim or the scheduler's sweep.
      await settleTrophyMembershipPrizes(pg, { userId: auth.uid })
      const prize: TrophyClaimPrize = {
        mana: paid.mana,
        freezes: paid.freezes,
        membership: await getMembershipResults(def.id, auth.uid, paid),
      }

      return {
        newlyClaimed: inserted.map(convertTrophyClaim),
        claims: await getTrophyClaims(pg, auth.uid),
        rewardAmount: prize.mana,
        prize,
        rewarded: await getRewardedMilestones(pg, auth.uid),
      }
    }
  )

async function readClaimedMilestoneIds(
  pg: SupabaseDirectClient,
  userId: string,
  trophyId: string
) {
  const rows = await pg.manyOrNone<{ milestone_id: string }>(
    `select milestone_id from user_trophy_milestones
     where user_id = $1 and trophy_id = $2`,
    [userId, trophyId]
  )
  return new Set(rows.map((r) => r.milestone_id))
}

// Stay in the Loop replaces the push notification bonus older accounts were
// paid. An account that has that bonus is paid no mana for the milestone, at
// any time: the bonus txn is never deleted. The rest of the prize still pays.
async function withoutRepeatedPushBonus(
  tx: SupabaseTransaction,
  userId: string,
  def: TrophyDefinition,
  prizes: TrophyMilestonePrize[]
) {
  const isPushPrize = (p: TrophyMilestonePrize) =>
    def.id === PUSH_BONUS_MILESTONE.trophyId &&
    p.milestone.id === PUSH_BONUS_MILESTONE.milestoneId &&
    p.prize.mana > 0
  if (!prizes.some(isPushPrize)) return prizes
  const bonus = await tx.oneOrNone(
    `select 1 from txns
     where category = 'PUSH_NOTIFICATION_BONUS' and to_id = $1 limit 1`,
    [userId]
  )
  if (!bonus) return prizes
  return prizes
    .map((p) =>
      isPushPrize(p)
        ? {
            ...p,
            base: { ...p.base, mana: 0 },
            prize: { ...p.prize, mana: 0 },
          }
        : p
    )
    .filter((p) => !isEmptyPrizeTotal(p.prize))
}

// What became of the membership days this claim paid, in ladder order. The
// payout has committed, so a failed read reports them as still on their way.
async function getMembershipResults(
  trophyId: string,
  userId: string,
  paid: PaidTrophyPrizes
): Promise<TrophyMembershipResult[]> {
  const results = await getTrophyMembershipResults(
    createSupabaseDirectClient(),
    userId,
    trophyId,
    paid.membership.map((m) => m.rewardId)
  ).catch((error) => {
    log.error('Failed to read trophy membership results', { userId, error })
    return new Map<string, TrophyMembershipResult>()
  })
  return [
    ...paid.membership.map(
      (m): TrophyMembershipResult =>
        results.get(m.rewardId) ?? {
          tier: m.tier ?? 'paid-tier',
          days: m.days,
          grantedDays: 0,
          outcome: m.status,
        }
    ),
    // Left unpaid: collectable once the account pays for a membership.
    ...paid.unpaidForPaidTier.map(
      (m): TrophyMembershipResult => ({
        tier: m.tier,
        days: m.days,
        grantedDays: 0,
        outcome: 'skipped',
      })
    ),
  ]
}

// Read the same latest value as get-user-achievements. Only fresh snapshots
// can raise the permanent peak. Both operations see the same statement snapshot.
async function readNetWorthAndRecordPeak(
  tx: SupabaseTransaction,
  userId: string
) {
  const snapshot = await tx.oneOrNone<{ value: number }>(
    `with snapshot as (
       select uphl.user_id, ${TROPHY_SNAPSHOT_NET_WORTH} as value,
         ${TROPHY_FRESH_PORTFOLIO_FILTER} as is_fresh
       from user_portfolio_history_latest uphl where uphl.user_id = $1
     ), record_peak as (
       insert into user_net_worth_peaks (user_id, peak_net_worth, peak_time)
       select user_id, value, now() from snapshot
       where is_fresh and value > 0 and value < 'Infinity'::numeric
       ${TROPHY_NET_WORTH_PEAK_CONFLICT}
     )
     select value from snapshot where value > '-Infinity'::numeric and value < 'Infinity'::numeric`,
    [userId]
  )
  const value = Number(snapshot?.value ?? 0)
  return Number.isFinite(value) ? value : 0
}

// Same numbers the profile shows: achievements for most trophies, the live
// starter count for "Getting started".
async function getStatValue(def: TrophyDefinition, userId: string) {
  if (isStarterTrophy(def)) {
    const stats = await getStarterStats(createSupabaseDirectClient(), userId)
    return getTrophyStatValue(def, stats)
  }
  return getTrophyStatValue(def, await loadUserAchievements(userId))
}
