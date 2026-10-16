import {
  getEffectiveBonusMultiplier,
  resolveEffectiveTier,
  roundTierBonus,
} from 'common/supporter-config'
import { ReferralTxn } from 'common/txn'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'
import { SupabaseTransaction } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { log } from 'shared/utils'

// 'signup' is the whole referral, paid when it's recorded (refer-user.ts).
// 'first_bet' and 'verify' are the two halves of the legacy split payout,
// still paid for referrals recorded before signup-time payouts.
export type ReferralBonusType = 'signup' | 'first_bet' | 'verify'

const DESCRIPTION_LABEL: Record<ReferralBonusType, string> = {
  signup: 'Referral bonus',
  first_bet: 'Referral first-bet bonus',
  verify: 'Referral verify bonus',
}

// Pays a referrer one referral bonus inside the caller's transaction, scaled by
// the referrer's effective tier (flagged: nothing, bonus-blocked: 0.2x, free:
// 1x, subscribers more). Returns the amount paid, or null if nothing was paid:
// this bonus type was already paid for the referred user, the referral was
// already paid in full (a pre-split legacy txn or a signup-time payout), or the
// tier rounds it to zero. The caller owns the transaction, so it also owns the
// isolation that makes the dedupe below race-free, and sends any notification
// after commit.
export async function payReferralBonus(
  tx: SupabaseTransaction,
  args: {
    referrer: User
    referredUserId: string
    referredContractId: string | undefined
    bonusType: ReferralBonusType
    baseAmount: number
  }
): Promise<number | null> {
  const {
    referrer,
    referredUserId,
    referredContractId,
    bonusType,
    baseAmount,
  } = args

  const existing = await tx.oneOrNone(
    `select 1 from txns
     where to_id = $1
       and category = 'REFERRAL'
       and data->'data'->>'referredUserId' = $2
       and (data->'data'->>'bonusType' is null
         or data->'data'->>'bonusType' in ($3, 'signup'))
     limit 1`,
    [referrer.id, referredUserId, bonusType]
  )
  if (existing) return null

  const entitlements = await getActiveSupporterEntitlements(tx, referrer.id)
  const referrerTier = resolveEffectiveTier({
    entitlements,
    bonusEligibility: referrer.bonusEligibility,
  })
  const referralMultiplier = getEffectiveBonusMultiplier(
    referrerTier,
    'referral'
  )
  const amount = roundTierBonus(baseAmount * referralMultiplier)
  if (amount <= 0) {
    log(
      `Skipped ${bonusType} referral bonus for referrer ${referrer.id} - effective tier ${referrerTier} (multiplier ${referralMultiplier})`
    )
    return null
  }

  const bonusTxn: Omit<ReferralTxn, 'id' | 'createdTime' | 'fromId'> = {
    fromType: 'BANK',
    toId: referrer.id,
    toType: 'USER',
    amount,
    token: 'M$',
    category: 'REFERRAL',
    description: `${DESCRIPTION_LABEL[bonusType]} for new user ${referredUserId}: ${amount}`,
    data: removeUndefinedProps({
      referredUserId,
      referredContractId,
      bonusType,
      effectiveTier: referrerTier,
      referralMultiplier,
      supporterBonus: referralMultiplier > 1,
    }),
  }
  await runTxnFromBank(tx, bonusTxn)
  log(
    `Paid ${bonusType} referral bonus of ${amount} to ${referrer.id} for ${referredUserId}`
  )
  return amount
}
