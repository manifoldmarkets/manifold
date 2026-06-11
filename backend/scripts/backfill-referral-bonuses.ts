// One-shot backfill for the referral payout gap introduced on 2026-04-08 by PR
// #3747 (Prize drawing). The pipeline was changed so the referral bonus only
// fires on iDenfy verification, but `canSetReferrer` was simultaneously gated
// on the old full-bonus-access check, which blocks brand-new users — so most
// referrals since then never got attributed and even the ones that did never got
// paid.
//
// This script pays:
//  - REFERRAL_BET_BONUS to the referrer for every user with referredByUserId
//    set who has placed at least one bet, if no first-bet/legacy REFERRAL txn
//    already exists for that referrer/referredUser pair.
//  - REFERRAL_VERIFY_BONUS to the referrer for every such user who is also
//    identity-verified (verified or grandfathered), if no verify/legacy REFERRAL
//    txn already exists.
// Referrer must have full bonus access in both cases. Supporter multiplier is
// applied using the referrer's current entitlements.

import { runScript } from 'run-script'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'
import { getBenefit } from 'common/supporter-config'
import { hasFullBonusAccess, isIdentityVerified, User } from 'common/user'
import { convertUser } from 'common/supabase/users'
import { REFERRAL_BET_BONUS, REFERRAL_VERIFY_BONUS } from 'common/economy'
import { ReferralTxn } from 'common/txn'
import { createReferralNotification } from 'shared/create-notification'
import { SupabaseDirectClient } from 'shared/supabase/init'

type BonusType = 'first_bet' | 'verify'

const DRY_RUN = process.env.DRY_RUN !== 'false'

// PR #3747 (Prize drawing) shipped 2026-04-08 17:46 PT and broke referral
// attribution + payouts. Scope the backfill to users signed up from a few
// days before that deploy through today so we don't accidentally pay out
// historical referrals that were skipped for unrelated reasons (referrer
// banned at the time, deleted accounts, etc.) and have since become eligible.
const BUG_WINDOW_START = process.env.BUG_WINDOW_START ?? '2026-04-01'

if (require.main === module) {
  runScript(async ({ pg }) => {
    if (DRY_RUN) {
      console.log(
        'DRY_RUN=true — no txns will be written. Set DRY_RUN=false to apply.'
      )
    }
    console.log(`Scoped to users with created_time >= ${BUG_WINDOW_START}`)

    const referredUsers = await pg.map(
      `SELECT * FROM users
       WHERE data->>'referredByUserId' IS NOT NULL
       AND created_time >= $1`,
      [BUG_WINDOW_START],
      (row) => convertUser(row)
    )
    console.log(
      `Found ${referredUsers.length} users with a referredByUserId in window`
    )

    let firstBetPaid = 0
    let verifyPaid = 0
    let firstBetTotalMana = 0
    let verifyTotalMana = 0
    let skipped = 0

    for (const user of referredUsers) {
      const referrerId = user.referredByUserId
      if (!referrerId) continue
      if (referrerId === user.id) {
        skipped++
        continue
      }

      const referrer = await pg.oneOrNone(
        `SELECT * FROM users WHERE id = $1`,
        [referrerId],
        (row) => (row ? convertUser(row) : null)
      )
      if (!referrer) {
        skipped++
        continue
      }
      if (!hasFullBonusAccess(referrer)) {
        skipped++
        continue
      }

      const existingTxns = await pg.manyOrNone<{ bonus_type: string | null }>(
        `SELECT data->'data'->>'bonusType' AS bonus_type
         FROM txns
         WHERE to_id = $1
         AND category = 'REFERRAL'
         AND data->'data'->>'referredUserId' = $2`,
        [referrer.id, user.id]
      )

      const hasLegacy = existingTxns.some((t) => t.bonus_type == null)
      const hasFirstBet =
        hasLegacy || existingTxns.some((t) => t.bonus_type === 'first_bet')
      const hasVerify =
        hasLegacy || existingTxns.some((t) => t.bonus_type === 'verify')

      const userHasBet = !!user.lastBetTime
      const userIsVerified = isIdentityVerified(user)

      if (!hasFirstBet && userHasBet) {
        const amount = await payBonus(pg, referrer, user, 'first_bet')
        if (amount > 0) {
          firstBetPaid++
          firstBetTotalMana += amount
        }
      }
      if (!hasVerify && userIsVerified) {
        const amount = await payBonus(pg, referrer, user, 'verify')
        if (amount > 0) {
          verifyPaid++
          verifyTotalMana += amount
        }
      }
    }

    console.log(
      `Done. first_bet payouts: ${firstBetPaid} (M${firstBetTotalMana} total), ` +
        `verify payouts: ${verifyPaid} (M${verifyTotalMana} total), ` +
        `skipped (no referrer or referrer ineligible): ${skipped}`
    )
    if (DRY_RUN) console.log('DRY_RUN was on — nothing was actually written.')
  })
}

async function payBonus(
  pg: SupabaseDirectClient,
  referrer: User,
  referredUser: User,
  bonusType: BonusType
): Promise<number> {
  const baseAmount =
    bonusType === 'first_bet' ? REFERRAL_BET_BONUS : REFERRAL_VERIFY_BONUS

  if (DRY_RUN) {
    console.log(
      `[dry-run] would pay ${baseAmount} (${bonusType}) to ${referrer.username} for ${referredUser.username}`
    )
    return baseAmount
  }

  return pg.tx(async (tx) => {
    // Re-check inside txn to avoid double-pay if script is run twice.
    const dup = await tx.oneOrNone(
      `SELECT 1 FROM txns WHERE to_id = $1
       AND category = 'REFERRAL'
       AND data->'data'->>'referredUserId' = $2
       AND (data->'data'->>'bonusType' IS NULL OR data->'data'->>'bonusType' = $3)`,
      [referrer.id, referredUser.id, bonusType]
    )
    if (dup) return 0

    const entitlements = await getActiveSupporterEntitlements(tx, referrer.id)
    const multiplier = getBenefit(entitlements, 'referralMultiplier')
    const amount = Math.floor(baseAmount * multiplier)

    const txn: Omit<ReferralTxn, 'id' | 'createdTime' | 'fromId'> = {
      fromType: 'BANK',
      toId: referrer.id,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'REFERRAL',
      description: `Referral ${bonusType} bonus (backfill) for new user ${referredUser.id}: ${amount}`,
      data: {
        referredUserId: referredUser.id,
        referredContractId: referredUser.referredByContractId,
        bonusType,
        backfill: true,
        supporterBonus: multiplier > 1,
        referralMultiplier: multiplier,
      },
    }
    await runTxnFromBank(tx, txn)
    console.log(
      `Paid ${amount} (${bonusType}) to ${referrer.username} for ${referredUser.username}`
    )
    await createReferralNotification(
      referrer.id,
      referredUser,
      amount.toString(),
      undefined,
      bonusType
    )
    return amount
  })
}
