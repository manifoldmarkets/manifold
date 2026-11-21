import { APIError, APIHandler } from 'api/helpers/endpoint'
import { onlyUsersWhoCanPerformAction } from 'api/helpers/rate-limit'
import {
  convertTrophyClaim,
  getRewardedMilestones,
  getStarterStats,
  getTrophyClaims,
} from 'api/helpers/trophies'
import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
} from 'common/supporter-config'
import {
  TrophyDefinition,
  getMilestone,
  getMilestonesToClaim,
  getRewardManaTotal,
  getTrophyDefinition,
  getTrophyStatValue,
  isStarterTrophy,
  isStarterTrophyAccount,
} from 'common/trophies'
import { getBanTypesForAction, isUserBanned } from 'common/ban-utils'
import { TrophyRewardTxn } from 'common/txn'
import { User, UserBan } from 'common/user'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { UserUpdate, broadcastUserUpdates } from 'shared/supabase/users'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { loadUserAchievements } from './get-user-achievements'

export const claimTrophy: APIHandler<'claim-trophy'> =
  onlyUsersWhoCanPerformAction(
    'claimTrophy',
    async ({ trophyId, milestoneId }, auth) => {
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

      // A stat can only grow, apart from rare cases such as a deleted
      // comment, and a claim is kept either way.
      const value = await getStatValue(def, auth.uid)
      const toClaim = getMilestonesToClaim(def, milestoneId, value)
      if (!toClaim) {
        throw new APIError(
          403,
          `You haven't reached ${
            milestone.name
          } yet: it needs ${milestone.threshold.toLocaleString()} ${def.unit}`
        )
      }

      const userUpdates: UserUpdate[] = []
      const { inserted, rewardAmount } = await pg.tx(async (tx) => {
        // Taken first, as quest rewards do, and the only lock waited for, so
        // this cannot deadlock with a bet or another payout.
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

        const rewardable = toClaim.filter((m) => (m.rewardMana ?? 0) > 0)
        if (!isStarterAccount || locked.is_bot || rewardable.length === 0) {
          return { inserted, rewardAmount: 0 }
        }

        // Same tier multiplier as quests: zero for flagged accounts, reduced
        // for bonus-blocked ones, more for members. Membership takes
        // precedence over a flag, as it does for quests.
        const entitlements = await getActiveSupporterEntitlements(tx, auth.uid)
        const effectiveTier = resolveEffectiveTier({
          entitlements,
          bonusEligibility: toBonusEligibility(locked.bonus_eligibility),
        })
        const multiplier = getEffectiveBonusMultiplier(effectiveTier, 'quest')
        // Nothing to pay: leave the rewards unpaid rather than used up, so
        // claiming again (directly, or via a higher milestone) pays them if
        // the account's standing changes.
        if (
          !(roundTierBonus(getRewardManaTotal(rewardable) * multiplier) > 0)
        ) {
          return { inserted, rewardAmount: 0 }
        }

        // Rewards are keyed separately from claims and never deleted, so a
        // milestone pays once even if its claim is removed and made again.
        // Only the rows inserted here are paid.
        const newlyRewarded = await tx.manyOrNone<{ milestone_id: string }>(
          `insert into user_trophy_rewards (user_id, trophy_id, milestone_id)
           select $1, $2, unnest($3::text[])
           on conflict (user_id, trophy_id, milestone_id) do nothing
           returning milestone_id`,
          [auth.uid, def.id, rewardable.map((m) => m.id)]
        )
        const newIds = new Set(newlyRewarded.map((r) => r.milestone_id))
        const paid = rewardable.filter((m) => newIds.has(m.id))
        const baseAmount = getRewardManaTotal(paid)
        const amount = roundTierBonus(baseAmount * multiplier)
        if (!Number.isFinite(amount) || !(amount > 0)) {
          return { inserted, rewardAmount: 0 }
        }

        const rewardTxn: Omit<TrophyRewardTxn, 'id' | 'createdTime'> = {
          fromId: 'BANK',
          fromType: 'BANK',
          toId: auth.uid,
          toType: 'USER',
          amount,
          token: 'M$',
          category: 'TROPHY_REWARD',
          description: `Trophy reward: ${paid.map((m) => m.name).join(', ')}`,
          data: {
            trophyId: def.id,
            milestoneIds: paid.map((m) => m.id),
            baseAmount,
            effectiveTier,
            multiplier,
          },
        }
        // The user row is locked above, so don't queue. Balance updates are
        // broadcast after commit.
        const txn = await runTxnOutsideBetQueue(tx, rewardTxn, false, (u) =>
          userUpdates.push(...u)
        )
        await tx.none(
          `update user_trophy_rewards set txn_id = $4
           where user_id = $1 and trophy_id = $2 and milestone_id = any($3::text[])`,
          [auth.uid, def.id, paid.map((m) => m.id), txn.id]
        )
        return { inserted, rewardAmount: amount }
      })
      if (userUpdates.length) broadcastUserUpdates(userUpdates)

      return {
        newlyClaimed: inserted.map(convertTrophyClaim),
        claims: await getTrophyClaims(pg, auth.uid),
        rewardAmount,
        rewarded: isStarterAccount
          ? await getRewardedMilestones(pg, auth.uid)
          : [],
      }
    }
  )

// Same numbers the profile shows: achievements for most trophies, the live
// starter count for "Getting started".
async function getStatValue(def: TrophyDefinition, userId: string) {
  if (isStarterTrophy(def)) {
    const stats = await getStarterStats(createSupabaseDirectClient(), userId)
    return getTrophyStatValue(def, stats)
  }
  return getTrophyStatValue(def, await loadUserAchievements(userId))
}

type BonusEligibility = NonNullable<User['bonusEligibility']>
const BONUS_ELIGIBILITY_VALUES: BonusEligibility[] = [
  'verified',
  'grandfathered',
  'eligible',
  'ineligible',
  'requires_verification',
]

const toBonusEligibility = (
  value: string | null
): BonusEligibility | undefined =>
  BONUS_ELIGIBILITY_VALUES.find((v) => v === value)
