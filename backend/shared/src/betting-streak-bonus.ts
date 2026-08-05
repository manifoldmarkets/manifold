import { Contract } from 'common/contract'
import {
  BETTING_STREAK_BONUS_AMOUNT,
  BETTING_STREAK_BONUS_MAX,
} from 'common/economy'
import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
} from 'common/supporter-config'
import { BettingStreakBonusTxn } from 'common/txn'
import { User } from 'common/user'
import { createBettingStreakBonusNotification } from 'shared/create-notification'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'

// Shared by the bet path (on-create-bet) and the perp trade path.
// `oldUser` must be the PRE-increment user: the bonus amount is
// (currentBettingStreak + 1) * base, read from the stale object.
export const payBettingStreak = async (
  oldUser: User,
  contract: Contract,
  /** Notification link target, e.g. `/username/slug/bets/betId`. */
  sourceSlug: string,
  /** sourceId for the zero-bonus notification, where no txn exists. */
  fallbackSourceId: string
) => {
  const pg = createSupabaseDirectClient()
  const result = await pg.tx(async (tx) => {
    const newBettingStreak = (oldUser.currentBettingStreak ?? 0) + 1

    // Fetch user's supporter entitlements for bonus multiplier
    const entitlements = await getActiveSupporterEntitlements(tx, oldUser.id)

    // Effective tier (verification + subscription) drives the streak multiplier.
    // Unverified users get 0.2x — the existing 5×streak / 25 cap naturally
    // becomes 1, 2, 3, 4, 5 / capped at 5 mana per day.
    const effectiveTier = resolveEffectiveTier({
      entitlements,
      bonusEligibility: oldUser.bonusEligibility,
    })
    const streakMultiplier = getEffectiveBonusMultiplier(
      effectiveTier,
      'streak'
    )

    // Send them the bonus times their streak, with effective-tier multiplier
    const baseBonus = Math.min(
      BETTING_STREAK_BONUS_AMOUNT * newBettingStreak,
      BETTING_STREAK_BONUS_MAX
    )
    const bonusAmount = roundTierBonus(baseBonus * streakMultiplier)

    if (bonusAmount <= 0) {
      return {
        bonusAmount: 0,
        sweepsBonusAmount: 0,
        newBettingStreak,
        txn: { id: fallbackSourceId },
        sweepsTxn: null,
        effectiveTier,
      }
    }

    const bonusTxnDetails = {
      currentBettingStreak: newBettingStreak,
      contractId: contract.id,
      effectiveTier,
      streakMultiplier,
      supporterBonus: streakMultiplier > 1,
    }

    const bonusTxn: Omit<
      BettingStreakBonusTxn,
      'id' | 'createdTime' | 'fromId'
    > = {
      fromType: 'BANK',
      toId: oldUser.id,
      toType: 'USER',
      amount: bonusAmount,
      token: 'M$',
      category: 'BETTING_STREAK_BONUS',
      data: bonusTxnDetails,
    }

    const txn = await runTxnFromBank(tx, bonusTxn)

    return { txn, bonusAmount, newBettingStreak, effectiveTier }
  })

  await createBettingStreakBonusNotification(
    oldUser,
    result.txn.id,
    sourceSlug,
    contract,
    result.bonusAmount,
    result.newBettingStreak,
    result.effectiveTier
  )
}
