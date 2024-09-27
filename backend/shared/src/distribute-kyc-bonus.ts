import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import {
  KYC_VERIFICATION_BONUS_CASH,
  REFERRAL_AMOUNT,
  REFERRAL_AMOUNT_CASH,
} from 'common/economy'
import { createReferralNotification } from './create-notification'
import { User } from 'common/user'
import { completeReferralsQuest } from './complete-quest-internal'

export async function distributeKycAndReferralBonus(
  pg: SupabaseDirectClient,
  user: User,
  referrerId: string | undefined,
  referrerSweepsVerified: boolean | undefined
) {
  const userId = user.id
  await pg.tx(async (tx) => {
    const data = await tx.oneOrNone<{
      reward_amount: number
      claimed: boolean
    }>(
      'select reward_amount, claimed from kyc_bonus_rewards where user_id = $1',
      [userId]
    )

    if (data?.claimed) {
      return
    }

    const reward = Math.max(
      data?.reward_amount ?? 0,
      KYC_VERIFICATION_BONUS_CASH
    )

    await runTxnFromBank(tx, {
      category: 'KYC_BONUS',
      token: 'CASH',
      amount: reward,
      fromType: 'BANK',
      toType: 'USER',
      toId: userId,
    })

    if (data) {
      await tx.none(
        'update kyc_bonus_rewards set claimed = true, claim_time = now() where user_id = $1',
        [userId]
      )
    } else {
      await tx.none(
        'insert into kyc_bonus_rewards (user_id, reward_amount, claimed, claim_time) values ($1, $2, true, now())',
        [userId, reward]
      )
    }
    if (referrerId) {
      await distributeReferralBonus(
        tx,
        userId,
        referrerId,
        referrerSweepsVerified
      )
    }
  })
  if (referrerId) {
    await createReferralNotification(referrerId, user, {
      manaAmount: REFERRAL_AMOUNT,
      cashAmount: referrerSweepsVerified ? REFERRAL_AMOUNT_CASH : 0,
    })
    await completeReferralsQuest(referrerId)
  }
}

export async function distributeReferralBonus(
  tx: SupabaseTransaction,
  userId: string,
  referrerId: string,
  referrerSweepsVerified: boolean | undefined
) {
  await runTxnFromBank(tx, {
    category: 'REFERRAL',
    token: 'M$',
    amount: REFERRAL_AMOUNT,
    fromType: 'BANK',
    toType: 'USER',
    toId: userId,
  })
  await runTxnFromBank(tx, {
    category: 'REFERRAL',
    token: 'CASH',
    amount: REFERRAL_AMOUNT_CASH,
    fromType: 'BANK',
    toType: 'USER',
    toId: userId,
  })

  await runTxnFromBank(tx, {
    category: 'REFERRAL',
    token: 'M$',
    amount: REFERRAL_AMOUNT,
    fromType: 'BANK',
    toType: 'USER',
    toId: referrerId,
  })
  if (referrerSweepsVerified) {
    await runTxnFromBank(tx, {
      category: 'REFERRAL',
      token: 'CASH',
      amount: REFERRAL_AMOUNT_CASH,
      fromType: 'BANK',
      toType: 'USER',
      toId: referrerId,
    })
  }
}
